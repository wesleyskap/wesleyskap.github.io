---
title: "Transactional Anomaly Detection: Exactly-Once Semantics (EOS) in Kafka"
excerpt: "Guarantee that each arrhythmia signal generates exactly one clinical alert. See how to orchestrate atomic read-write-commit transactions with KafkaJS in Node.js."
category: "Messaging"
date: "July 24, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Risk of Inconsistency in Critical Alerts

In medical telemetry processing, we often have pipelines that perform sequential reads and writes across topics. For example:
1. **Read** a block of raw ECG coordinates from the `teste.ecg.raw` topic.
2. **Process** the signal using an analytical algorithm. If it detects an atrial fibrillation (arrhythmia) pattern, the application generates an alert.
3. **Write** the alert to the `teste.alerts.critical` topic.
4. **Update (Commit)** the read offset in the original topic.

If the Node.js server crashes right after step 3 but before step 4 (commit), a new instance will restart and reprocess the same ECG reading. This will result in a **second identical emergency alert** being sent to the clinical staff. In high-stress clinical environments, duplicate alarms generate "alarm fatigue" and decrease overall system trust.

To prevent this, we use Kafka's transactional features, known as **Exactly-Once Semantics (EOS)**.

---

## How Exactly-Once Semantics (EOS) Works

Kafka introduced support for transactions by allowing you to group message production and consumer offsets commit into a single atomic unit coordinated by the broker.

* **Idempotence**: Guarantees loss-free and duplicate-free writing in isolation.
* **Transactional ID**: A unique identifier assigned to the producer. This allows the broker to neutralize old instances ("zombies") of the same producer that may resurface after a network partition (using an Epoch mechanism).
* **Isolation Level (`read_committed`)**: A setting in consumers indicating that they should only read messages whose associated transactions were completed successfully (committed). Messages from aborted transactions are simply ignored by consumers.

---

## The Transactional Script (`transactional-detector.js`)

The code below implements a complete transactional read-and-write loop. If the ECG signal indicates a simulated arrhythmia, it will produce a critical alert and register the consumer's offset within the same transaction. If any stage fails, the entire operation is rolled back and no other microservice will read the partial alert:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-anomaly-detector',
  brokers: ['localhost:9092']
});

const GROUP_ID = 'anomaly-detector-group';
const TOPIC_RAW = 'teste.ecg.raw';
const TOPIC_ALERTS = 'teste.alerts.critical';

// We create the transactional producer by setting the transactionalId
const producer = kafka.producer({
  idempotent: true,
  transactionalId: 'medical-alert-tx-producer-01'
});

const consumer = kafka.consumer({
  groupId: GROUP_ID,
  // IMPORTANT: Only read messages that were committed successfully
  readUncommitted: false 
});

// Simulated arrhythmia detection algorithm
function detectArrhythmia(payload) {
  // Simulates anomaly if the peak wave voltage is abnormal (e.g., > 1.5 mV)
  return payload.signal_millivolts > 1.5;
}

async function run() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topic: TOPIC_RAW, fromBeginning: false });

  await consumer.run({
    autoCommit: false, // Disable autocommit so we control offsets inside the transaction manually
    
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      const { topic, partition } = batch;

      if (batch.messages.length === 0) return;

      console.log(`[Batch] Analyzing ${batch.messages.length} readings...`);

      // 1. Initialize the transaction on the producer
      const transaction = await producer.transaction();

      try {
        for (let message of batch.messages) {
          const payload = JSON.parse(message.value.toString());
          
          if (detectArrhythmia(payload)) {
            console.warn(`[ALERT] Anomaly detected in patient ${payload.patient_id}! Value: ${payload.signal_millivolts} mV`);

            // Produce the alert using the transaction
            await transaction.send({
              topic: TOPIC_ALERTS,
              messages: [{
                key: payload.patient_id,
                value: JSON.stringify({
                  patient_id: payload.patient_id,
                  event: 'ARRHYTHMIA_DETECTED',
                  measured_value: payload.signal_millivolts,
                  detected_at: new Date().toISOString()
                })
              }]
            });
          }

          // Resolve the offset locally in memory
          resolveOffset(message.offset);
          await heartbeat();
        }

          // 2. Send committed consumer offsets TO THE TRANSACTION.
          // The committed offset must be the next one to be read (offset of the last message + 1)
          const lastMessage = batch.messages[batch.messages.length - 1];
          const nextOffset = (parseInt(lastMessage.offset, 10) + 1).toString();

          await transaction.sendOffsets({
            consumerGroupId: GROUP_ID,
            offsets: [{ topic, partition, offset: nextOffset }]
          });

          // 3. Commit the transaction. Kafka writes the commit marker to logs,
          // releases the alerts for consumption, and consolidates the consumer offset.
          await transaction.commit();
          console.log(`[EOS Commit] Batch transacted successfully for partition ${partition}`);

      } catch (err) {
        console.error('[EOS Abort] Critical error detected. Aborting transaction...', err);
        
        // If there's any failure in the middle of the process, revert all writes
        await transaction.abort();
      }
    }
  });
}

run().catch(console.error);
```

---

## Conclusion of the Series

Congratulations! Throughout this series, we structured a medical telemetry API from end to end:

1. **Part 1**: Conceptualized the mechanics of Kafka's sequential log.
2. **Part 2**: Configured a local KRaft cluster and provisioned the biological signals topic programmatically.
3. **Part 3**: Implemented an idempotent producer with compression for high-concurrency data streams.
4. **Part 4**: Designed a scalable consumer with manual offset commits and native backpressure.
5. **Part 5**: Created resilience by isolating faulty signals into Retry Topics and DLQ.
6. **Part 6**: Guaranteed the reliability of medical alerts using Exactly-Once (EOS) atomic transactions.

With this conceptual and practical foundation, you are ready to deploy Node.js microservices integrated with Apache Kafka prepared to support real-time hospital data loads at production scale.
