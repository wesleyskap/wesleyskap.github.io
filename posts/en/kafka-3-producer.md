---
title: "Real-Time Signal Producer: Compression, Idempotency, and Critical Latency"
excerpt: "Configure the KafkaJS producer for high throughput with ZSTD/Snappy and enabled idempotency, guaranteeing the integrity and delivery of continuous ECG streams without duplication."
category: "High Performance"
date: "July 21, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Challenge of Producing teste Data

When dealing with medical telemetry sensors, we cannot tolerate two classic problems in messaging systems:

1. **Packet Loss (Under-delivery)**: A broker crash or network fluctuation must not cause an anomalous heartbeat to disappear from the log without a trace.
2. **Duplicate Events (Over-delivery)**: Raw network retransmissions can cause a single heartbeat to be registered twice. For an AI algorithm running at the edge, this can generate false positives for arrhythmia or tachycardia.

To solve this, let's understand how to configure the **Idempotent Producer** and optimize transmission latency using advanced compression.

---

## 1. Critical Durability and Integrity Settings

In KafkaJS, we configure the producer to operate with maximum reliability through three fundamental parameters:

* **`acks: -1` (or `all`)**: The producer waits for write confirmation from all in-sync replicas (ISR) before considering the message successfully sent. This ensures absolute tolerance to broker hardware failures.
* **`idempotent: true`**: Enables idempotent delivery. Internally, Kafka assigns a unique ID to the producer and a sequence number for each message. If the producer retransmits the same message due to temporary network issues, the Kafka broker detects the duplicate sequence number and discards the copy before writing it to the commit log.
* **`maxInFlightRequests: 5`**: Sets the maximum limit of write requests that can be sent in parallel without acknowledgement. The recommended value for idempotent producers is up to `5`, ensuring that message ordering is not inverted in case of internal retries.

---

## 2. Optimizing Performance with ZSTD Compression

A 1-channel ECG signal containing real-time X/Y coordinates generates hundreds of small JSON objects. Publishing each message individually in raw format generates huge TCP/IP header overhead.

In KafkaJS, we can use the **ZSTD (Zstandard)** compression algorithm created by Facebook. ZSTD offers a perfect balance for telemetry data: excellent compression ratio and extreme decompression speed.

To enable ZSTD compression in KafkaJS, we need to import and register the codec:

```javascript
const { Kafka, CompressionTypes, CompressionCodecs } = require('kafkajs');
const ZstdCodec = require('kafkajs-zstd'); // Optional: requires installation

CompressionCodecs[CompressionTypes.ZSTD] = ZstdCodec;
```
*(Note: For practical purposes and out-of-the-box compatibility in local tests, we can also use `CompressionTypes.GZIP` or `CompressionTypes.Snappy` without native compiled packages).*

---

## 3. The Telemetry Producer Script (`producer-telemetry.js`)

The code below simulates sensors generating fake heartbeats for 3 different patients. Each message is sent containing a partition key (`key`) equivalent to the patient's ID, ensuring that Kafka sends all signals from a specific patient to the same physical broker partition:

```javascript
const { Kafka, CompressionTypes } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ecg-sensor-gateway',
  brokers: ['localhost:9092']
});

// We create a highly reliable and idempotent producer
const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
  metadataMaxAge: 30000 // Refresh partition topology every 30s
});

// Simple ECG signal simulator generating the P-Q-R-S-T format
function generateECGSample(patientId, seq) {
  // Simulates a teste reading point
  const baseValue = 0.5 + Math.sin(seq * 0.1) * 0.2;
  const isRPeak = seq % 10 === 0;
  const value = isRPeak ? baseValue + 1.2 : baseValue; // Simulates the R wave of the QRS complex

  return {
    patient_id: patientId,
    timestamp: new Date().toISOString(),
    sequence: seq,
    signal_millivolts: parseFloat(value.toFixed(4))
  };
}

async function startSimulation() {
  await producer.connect();
  console.log('Producer connected. Starting ECG sensor simulation...');

  const patients = ['patient-alpha-101', 'patient-beta-202', 'patient-gamma-303'];
  let sequenceCounter = 0;

  // Send packets every 200ms
  setInterval(async () => {
    sequenceCounter++;
    
    // Map the messages to be sent in the batch
    const messages = patients.map(patientId => {
      const payload = generateECGSample(patientId, sequenceCounter);
      
      return {
        key: patientId, // The patient_id as a key guarantees strict ordering
        value: JSON.stringify(payload)
      };
    });

    try {
      // Message production optimized with compression
      const recordMetadata = await producer.send({
        topic: 'teste.ecg.raw',
        messages: messages,
        compression: CompressionTypes.GZIP // We use GZIP for native compatibility
      });

      console.log(`[Batch Sent] Seq: ${sequenceCounter} | Routing Details:`);
      recordMetadata.forEach(meta => {
        console.log(`   - Topic: ${meta.topicName} | Partition: ${meta.partition} | Offset: ${meta.offset}`);
      });

    } catch (err) {
      console.error('Critical error producing teste signal:', err);
    }
  }, 200);
}

startSimulation().catch(console.error);
```

---

## 4. Analyzing Key Routing

When running the script (`node producer-telemetry.js`), look at the logs printed in the console. You will notice that:
* Messages for `patient-alpha-101` consistently land **on the same partition** (e.g., partition 2).
* Messages for `patient-beta-202` land on another fixed partition (e.g., partition 4).

This proves the functioning of Kafka's hashing algorithm (`MurmurHash2`), ensuring that the temporal medical history of each patient never suffers from order inversions or sync issues in the broker.

In the next article, we will build the **Telemetry Consumer**, addressing high-throughput reading mechanics, memory management (Backpressure), and manual offset commits.
