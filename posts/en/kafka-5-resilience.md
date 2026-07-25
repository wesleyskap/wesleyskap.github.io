---
title: "Resilience in Telemetry: Isolating Noise with Retry Topics and DLQ"
excerpt: "Learn to handle sensor failures and noisy payloads without causing Head-of-Line Blocking. Design a resilient retry flow with backoff and DLQ in Node.js."
category: "Resilience"
date: "July 23, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Danger of Partition Blocking (Head-of-Line Blocking)

If an ECG sensor develops a physical defect and starts sending corrupted data (e.g., null voltage values or values outside the biological range), our consumer will fail when attempting to process it.

If we implement a traditional `try/catch` block that repeats the operation indefinitely until it succeeds, the consumption of that entire partition will be paralyzed. No other patient whose data is on the same partition will have their readings processed. This is called **Head-of-Line Blocking**.

In critical systems, processing noisy signals or handling temporary failures of external APIs must be resolved using a resilient strategy of **Retry Topics** and **Dead Letter Queues (DLQ)**.

---

## The Recovery Flow Architecture

Instead of locking up the queue, we will implement the following asynchronous flow:

1. The consumer reads from the main topic `teste.ecg.raw`.
2. If processing fails due to a validation error (critical noise), it publishes the message to the topic `teste.ecg.dlq` and commits the original message to continue reading healthy data.
3. If the failure is temporary (e.g., a network timeout with the analysis API), the consumer publishes the signal to the topic `teste.ecg.retry-5s` with an incremented header (`x-retry-count`).
4. A specific consumer for the retry topic will read the message, wait for the backoff time (5 seconds), and try again. If it runs out of attempts (e.g., 3 times), the signal goes to the DLQ.

```
[Sensor Gateway] -> teste.ecg.raw
                          | (Temporary failure)
                          v
                    teste.ecg.retry-5s (waits 5s)
                          | (Attempts exhausted or severe noise)
                          v
                    teste.ecg.dlq
```

---

## The Resilience Script (`resilient-consumer.js`)

Here is the practical implementation of this error state machine using Node.js and KafkaJS:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-resilient-service',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'medical-resilient-group' });

const TOPIC_RAW = 'teste.ecg.raw';
const TOPIC_RETRY = 'teste.ecg.retry-5s';
const TOPIC_DLQ = 'teste.ecg.dlq';

const MAX_RETRIES = 3;

// Simple biological validator
function isSignalCorrupted(payload) {
  // Simulates that noise with extreme voltage above 5.0 mV is invalid (electrode failure)
  return payload.signal_millivolts > 5.0;
}

// Simulated external API call
async function analyzeTelemetryAPI(payload) {
  // Simulates a temporary network failure if the current second is even
  if (new Date().getSeconds() % 2 === 0) {
    throw new Error('Temporary timeout in Cardiology API');
  }
}

async function run() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topics: [TOPIC_RAW, TOPIC_RETRY] });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const payloadString = message.value.toString();
      const payload = JSON.parse(payloadString);
      
      // Read metadata of previous attempts from the message header
      let retryCount = 0;
      if (message.headers && message.headers['x-retry-count']) {
        retryCount = parseInt(message.headers['x-retry-count'].toString(), 10);
      }

      console.log(`[Consumption] Topic: ${topic} | Patient: ${payload.patient_id} | Attempt: ${retryCount}`);

      try {
        // 1. Signal integrity validation (Critical Noise)
        if (isSignalCorrupted(payload)) {
          console.warn(`[NOISE DETECTED] Signal of patient ${payload.patient_id} corrupted. Sending to DLQ...`);
          await sendToDLQ(payload, 'Electrode noise above teste threshold');
          await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);
          return;
        }

        // If the message comes from the retry topic, we simulate the 5s backoff
        if (topic === TOPIC_RETRY) {
          const timeSinceMessage = Date.now() - new Date(payload.timestamp).getTime();
          const waitTime = Math.max(0, 5000 - timeSinceMessage);
          if (waitTime > 0) {
            console.log(`[Backoff] Waiting ${waitTime}ms before processing retry...`);
            await new Promise(r => setTimeout(r, waitTime));
          }
        }

        // 2. Try processing
        await analyzeTelemetryAPI(payload);
        console.log(`[SUCCESS] Processing completed for patient: ${payload.patient_id}`);
        
        // Confirm read
        await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);

      } catch (err) {
        console.error(`[ERROR] Processing failed. Reason: ${err.message}`);
        
        if (retryCount >= MAX_RETRIES) {
          console.error(`[DLQ EXHAUSTION] Attempts exhausted (${retryCount}/${MAX_RETRIES}). Sending to DLQ...`);
          await sendToDLQ(payload, err.message);
        } else {
          // Increment and send to retry topic
          const nextRetry = retryCount + 1;
          console.log(`[RETRY] Forwarding to retry topic. Attempt: ${nextRetry}`);
          
          await producer.send({
            topic: TOPIC_RETRY,
            messages: [{
              key: message.key,
              value: JSON.stringify(payload),
              headers: {
                'x-retry-count': String(nextRetry),
                'x-original-error': err.message
              }
            }]
          });
        }

        // Commit the message on the origin queue anyway to free up the partition
        await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);
      }
    }
  });
}

async function sendToDLQ(payload, reason) {
  await producer.send({
    topic: TOPIC_DLQ,
    messages: [{
      key: payload.patient_id,
      value: JSON.stringify(payload),
      headers: {
        'x-dead-reason': reason,
        'x-dead-timestamp': new Date().toISOString()
      }
    }]
  });
}

run().catch(console.error);
```

## Conclusion

With this architecture of isolated retries and DLQ, we guarantee that our Node.js API keeps running at high speed even if some electrodes fail or if a medical server temporarily goes down. No messages are lost, and healthy patients are attended to immediately.

In the next article in this series, we will see how to apply **Exactly-Once Semantics (EOS)** using transactions in Kafka, which is ideal for the final recording of clinical alerts.
