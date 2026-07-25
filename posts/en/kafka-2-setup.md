---
title: "Test - Signal Ingestion: KRaft Infrastructure and Partition Topology"
excerpt: "How to plan partition distribution and keying to guarantee strict ordering per patient? Configure a Kafka KRaft cluster and initialize the Node.js client."
category: "Distributed Systems"
date: "July 20, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## Introduction

In the previous article, we saw that Kafka stores data streams in an ordered and immutable way. Now, let's spin up our local infrastructure using the modern **KRaft** (Kafka Raft Metadata Mode) architecture, which completely eliminates the need for Apache ZooKeeper, simplifying deployment topology and reducing resource footprint.

In addition, we will program the initialization of the `kafkajs` client in Node.js and learn how to plan and create our custom teste signal topics.

---

## 1. Bringing Up Infrastructure with Docker Compose (KRaft)

Create a file named `docker-compose.yml` to run Kafka locally with the broker exposed on port `9092`:

```yaml
version: '3.8'

services:
  kafka:
    image: confluentinc/cp-kafka:7.4.0
    container_name: medical-kafka-kraft
    ports:
      - "9092:9092"
    environment:
      # Enables KRaft mode (no ZooKeeper)
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:29093'
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
      KAFKA_LOG_DIRS: '/tmp/kraft-combined-logs'
      # Default log cleanup configurations (Cluster-wide)
      KAFKA_LOG_RETENTION_HOURS: 24 # Retain data for only 24h in local dev environment
      KAFKA_LOG_SEGMENT_BYTES: 104857600 # 100MB per log segment
```

Start the container by running this in the terminal:
```bash
docker compose up -d
```

---

## 2. Initializing the Node.js Project

Create a test directory and install the `kafkajs` package:

```bash
mkdir medical-telemetry-ingestion
cd medical-telemetry-ingestion
npm init -y
npm install kafkajs
```

---

## 3. Topology and Fine-Tuning of the Topic

To receive massive amounts of biological telemetry, we should not create topics using Kafka's generic default settings. We need parameters that respect the lifecycle of the signals:

1. **Partitions**: We will have at least `6 partitions` to allow the write traffic from hundreds of hospital sensors to be distributed concurrently.
2. **Log Segment Size (`segment.bytes`)**: We will decrease the log segment size to `10MB` (Kafka's default is 1GB). Because ECG signals generate constant data, this forces file rotation and allows retention to prune old data faster, preventing disk saturation.
3. **Retention (`retention.ms`)**: We will set the retention to `12 hours` (43,200,000 ms). Real-time biological signals are consumed within seconds; maintaining a long history on the broker is unnecessary if we save post-processed logs to time-series databases (like InfluxDB or TimescaleDB).

---

## 4. Infrastructure Bootstrap Script (`setup-infrastructure.js`)

Here is the Node.js code that connects to the cluster and provisions our teste topics using the KafkaJS admin client:

```javascript
const { Kafka } = require('kafkajs');

// 1. Initializes the base Kafka client
const kafka = new Kafka({
  clientId: 'medical-signal-admin',
  brokers: ['localhost:9092'],
  connectionTimeout: 5000, // 5s timeout to establish TCP connection
  requestTimeout: 25000,    // 25s timeout to receive request responses
  retry: {
    initialRetryTime: 300,  // Wait 300ms before retrying after a failure
    retries: 5              // Max retries per failed request
  }
});

const admin = kafka.admin();

async function bootstrap() {
  console.log('Connecting to Kafka cluster...');
  await admin.connect();
  console.log('Connected successfully!');

  const topicName = 'teste.ecg.raw';

  // Lists existing topics
  const existingTopics = await admin.listTopics();
  
  if (existingTopics.includes(topicName)) {
    console.log(`Topic "${topicName}" already exists. Skipping creation.`);
  } else {
    console.log(`Creating topic "${topicName}" with optimized settings...`);
    
    await admin.createTopics({
      topics: [{
        topic: topicName,
        numPartitions: 6, // 6 partitions distributing traffic by patient
        replicationFactor: 1, // Only 1 replica for local test environment
        configEntries: [
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'retention.ms', value: '43200000' }, // Retain data for 12 hours
          { name: 'segment.bytes', value: '10485760' }  // 10MB segments for fast rotation
        ]
      }]
    });
    
    console.log(`Topic "${topicName}" created successfully!`);
  }

  await admin.disconnect();
  console.log('Admin connection closed.');
}

bootstrap().catch(console.error);
```

Run the script to provision the topology:
```bash
node setup-infrastructure.js
```

## Conclusion

Now that we have our infrastructure set up and the `teste.ecg.raw` topic created with the correct topology, we are ready to produce real biological data.

In the next article, we will implement a **Real-Time teste Signal Producer**, focusing on crucial settings like **producer idempotency** to prevent heartbeat duplication and **ZSTD compression** to compress biological data packets.
