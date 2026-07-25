---
title: "Simulating Massive Load: Load Testing Ingestion with k6 and Kafka"
excerpt: "How to stress the medical signal pipeline by simulating thousands of concurrent sensor connections? Write a k6 script to test the limits of Node.js and Kafka."
category: "High Performance"
date: "July 25, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "kafka-biomedical-signals-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Challenge of Real-Scale Load

Up to this point, we tested our medical telemetry producer and consumer by running background scripts with only a few patient emulators. But how will our Node.js microservice architecture and Apache Kafka behave under real-world stress?

Imagine the peak hour in a connected hospital: thousands of ECG and EEG devices sending pulses continuously. A processing delay of just a few milliseconds in the HTTP/HTTPS signal ingestion API can result in full buffers, network timeouts, and lost monitoring data.

To validate the physical limits of our system before putting it into production, we will use **k6** (a modern, open-source load-testing tool written in Go that runs JavaScript scripts) to simulate heavy telemetry loads.

---

## 1. Building the High-Performance Ingestion API (`ingestion-api.js`)

To handle the massive load test, we will use **Fastify** in Node.js instead of Express. Fastify has near-zero routing overhead and is ideal for handling tens of thousands of requests per second.

First, install the dependencies:
```bash
npm install fastify kafkajs
```

Here is the code for our Ingestion API (`server.js`):

```javascript
const fastify = require('fastify')({ logger: false });
const { Kafka, CompressionTypes } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ingestion-api',
  brokers: ['localhost:9092']
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5
});

// Endpoint that receives the biomedical signal stream from the electrode
fastify.post('/api/v1/telemetry', async (request, reply) => {
  const { patient_id, signal_millivolts, sequence } = request.body;

  if (!patient_id || signal_millivolts === undefined) {
    return reply.status(400).send({ error: 'Incomplete payload.' });
  }

  try {
    // Fast production using the patient as a key to guarantee ordering
    await producer.send({
      topic: 'biomedical.ecg.raw',
      compression: CompressionTypes.GZIP,
      messages: [{
        key: patient_id,
        value: JSON.stringify({
          patient_id,
          signal_millivolts,
          sequence,
          timestamp: new Date().toISOString()
        })
      }]
    });

    return reply.status(202).send({ status: 'ACCEPTED' }); // 202 Accepted indicates async processing
  } catch (err) {
    return reply.status(500).send({ error: 'Internal failure queueing signal.' });
  }
});

async function start() {
  await producer.connect();
  console.log('Kafka producer connected.');
  
  await fastify.listen({ port: 3000 });
  console.log('Fastify Ingestion API running on port 3000.');
}

start().catch(console.error);
```

---

## 2. Writing the k6 Load Test Script (`k6-load-test.js`)

Our load test with k6 will simulate a ramp scenario:
1. **Ramp-up (0 to 30s)**: Gradually increases from 0 to **200 concurrent virtual users (VUs)**.
2. **Load Plateau (30s to 1m30s)**: Maintained at 200 VUs generating simulated heartbeats uninterruptedly.
3. **Ramp-down (1m30s to 2m)**: Gradually reduces traffic back to zero to evaluate collector recovery.

Create the file `k6-load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // Ramp to 200 concurrent sensors
    { duration: '1m', target: 200 },  // Maintain stress for 1 minute
    { duration: '30s', target: 0 },    // Cooldown
  ],
  thresholds: {
    // Define quality criteria (SLA)
    http_req_duration: ['p(95)<50', 'p(99)<150'], // 95% of requests must respond in under 50ms
    http_req_failed: ['rate<0.01'],               // Less than 1% HTTP errors allowed
  },
};

export default function () {
  // Simulates random patient IDs from a list of 500 unique patients
  const patientId = `patient-k6-${randomIntBetween(1, 500)}`;
  const signalValue = parseFloat((Math.random() * 2.0).toFixed(4));
  const sequence = __ITER; // Global k6 iteration as sequence counter

  const payload = JSON.stringify({
    patient_id: patientId,
    signal_millivolts: signalValue,
    sequence: sequence
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Trigger HTTP POST request to our Fastify API
  const res = http.post('http://localhost:3000/api/v1/telemetry', payload, params);

  // Validate that the server returned code 202 (Accepted)
  check(res, {
    'status is 202': (r) => r.status === 202,
  });

  // Each simulated device sends data at intervals of approximately 100ms
  sleep(0.1);
}
```

---

## 3. Running the Load Test

With the Fastify API running (`node server.js`) and Docker with Kafka running, execute k6 pointing to the script:

```bash
k6 run k6-load-test.js
```

---

## 4. What to Observe in the Results?

At the end of the test, k6 will display a consolidated report in the terminal. Pay close attention to the following critical metrics:

* **`http_req_duration`**: End-to-end API latency. In medical telemetry pipelines, p(99) latencies above 150ms indicate write bottlenecks in the Kafka producer or a lack of processing threads in Node.js.
* **`http_req_failed`**: If this rate rises above 0%, check if Kafka has reached memory limits or if the Fastify API TCP connection pool is exhausted.
* **Consumer Lag**: While the load test sends thousands of messages, run this in the terminal:
  ```bash
  docker exec -it medical-kafka-kraft kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group medical-ecg-analysis-group
  ```
  This will show the distance (Lag) between the produced offset and the consumed offset. If the lag increases infinitely, it means your consumer layer needs more Node.js instances running in parallel to handle the ingested volume.

## Conclusion

Running frequent load tests with k6 helps calibrate Kafka topology (increasing partitions) and fine-tune TCP pooling and payload limits in Node.js. You now have a complete, secure, resilient, and stress-tested real-time hospital signal pipeline.
