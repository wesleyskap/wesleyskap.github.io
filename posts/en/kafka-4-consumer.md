---
title: "Telemetry Consumer: Continuous Processing and Time Windows"
excerpt: "Implement a robust Node.js consumer with local backpressure controls, manual offset commits, and consumer group rebalance management during medical telemetry ingestion."
category: "Messaging"
date: "July 22, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Challenge of Real-Time Consumption

Receiving millions of heartbeats is only half the battle. The other half is processing them safely.

Unlike traditional systems where the broker pushes messages directly to consumers, in Kafka the consumer actively fetches the data (**Pull Model**). This gives us full control over the flow, allowing us to mitigate critical consumption issues:

1. **Offset Loss (At-least-once vs. At-most-once)**: If Node.js acknowledges message receipt before storing the message in the database and then crashes immediately, the biological signals from that period will be permanently lost.
2. **Out of Memory (OOM)**: If Kafka's ingestion speed is higher than our application's capacity to process and persist the data in the database, Node.js memory will saturate.

---

## 1. Fine-Tuning Consumer Settings

In KafkaJS, we configure the consumer to read data optimally by adjusting fetch limits:

* **`maxBytesPerPartition`**: Defines the maximum amount of data the broker can return per partition in each fetch request. The default of 1MB is safe, but for dense streams, reducing this to `500KB` helps decrease Node.js heap spikes.
* **`maxWaitTimeInMs`**: The maximum amount of time the broker waits to accumulate data if the minimum fetch limit (`minBytes`) has not yet been met.
* **Disable `autoCommit: false`**: We will manually commit offsets only after we are certain that the patient's signal data has been properly validated and queued for writes.

---

## 2. Handling Consumer Group Rebalances

When we scale our Node.js API (e.g., launching new instances in Kubernetes), Kafka triggers a **rebalance**. It temporarily pauses consumption and redistributes partitions evenly among the available consumers.

If the rebalance takes too long, the application might be kicked out of the group. Therefore, we adjust:
* **`sessionTimeout`**: The threshold for the broker to consider a consumer dead if it stops sending heartbeats (e.g., 30 seconds).
* **`rebalanceTimeout`**: The time the consumer has to process pending messages and accept the new partition assignment (e.g., 60 seconds).

---

## 3. The Resilient Consumer Script (`consumer-telemetry.js`)

Here is the Node.js consumer code that subscribes to the `teste.ecg.raw` topic, processes medical signals simulating database persistence latency, and performs manual commits in batches:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ecg-processor',
  brokers: ['localhost:9092']
});

// We create the consumer associated with the ECG processing group
const consumer = kafka.consumer({
  groupId: 'medical-ecg-analysis-group',
  sessionTimeout: 30000,
  rebalanceTimeout: 60000,
  heartbeatInterval: 10000 // Send heartbeats to the broker every 10s
});

// Simulated database (50ms insertion time)
const saveToDatabase = async (payload) => {
  return new Promise(resolve => setTimeout(resolve, 50));
};

async function run() {
  await consumer.connect();
  console.log('Consumer connected to cluster.');

  // Subscribe to the topic starting from the most recent offset by default
  await consumer.subscribe({ topic: 'teste.ecg.raw', fromBeginning: false });

  // Listening to lifecycle events for infrastructure auditing
  consumer.on(consumer.events.GROUP_JOIN, (e) => {
    console.log(`[Lifecycle] Consumer joined group. Assigned partitions:`, e.payload.memberAssignment);
  });

  consumer.on(consumer.events.REBALANCING, () => {
    console.log('[Lifecycle] Group rebalancing detected. Pausing consumption...');
  });

  // Start the consumption engine
  await consumer.run({
    autoCommit: false, // Disable automatic commits to guarantee "At-Least-Once" delivery
    
    // Batch processing to optimize I/O
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
      console.log(`[New Batch] Received ${batch.messages.length} messages from partition ${batch.partition}`);

      for (let message of batch.messages) {
        const payload = JSON.parse(message.value.toString());
        
        // Simulating medical processing / noise analysis
        console.log(`   - Patient: ${payload.patient_id} | Voltage: ${payload.signal_millivolts} mV | Seq: ${payload.sequence}`);
        
        // Save data to the analytical database
        await saveToDatabase(payload);

        // Mark the message as read in memory
        resolveOffset(message.offset);
        
        // Notify the Kafka coordinator that the application is alive
        await heartbeat();
      }

      // Commit processed offsets for the batch back to the broker
      await commitOffsetsIfNecessary();
      console.log(`[Batch Processed] Offsets for partition ${batch.partition} committed to Kafka.`);
    }
  });
}

run().catch(console.error);
```

---

## 4. The Backpressure Mechanism in Node.js

By using the `eachBatch` method of KafkaJS in conjunction with `autoCommit: false`, the fetch flow for new messages is paused until the promise of the previous batch is resolved.

If the database starts responding slowly, the `for (let message of batch.messages)` loop will take longer to finish. This delays the return of `eachBatch`, forcing KafkaJS to wait before asking the broker for the next batch. Consumption enters a natural pace dictated by the physical bottleneck of the database, preventing Node.js from accumulating gigabytes of messages in memory.

In the next article, we will address advanced resilience: how to isolate noisy heartbeats in a **Dead Letter Queue (DLQ)** and handle outages with **dynamic Retry Topics** without blocking the consumption of healthy patients.
