---
title: "Demystifying Apache Kafka: Why Use It for Medical Telemetry?"
excerpt: "Understand the concept of a distributed commit log and discover why Kafka is the ideal choice for managing high-frequency teste signal streams like EEG and ECG."
category: "Distributed Systems"
date: "July 19, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Nature of Medical Telemetry

Imagine managing the data stream of hundreds of hospital beds, where each patient has Electrocardiogram (ECG) sensors generating 250 samples per second, and Electroencephalogram (EEG) sensors generating up to 1000 samples per second. 

Trying to save each reading directly to a relational database creates an immediate write bottleneck. Using traditional queue-based messaging (like RabbitMQ or AWS SQS) also presents challenges: once the message is consumed, it is deleted. If you need to reprocess the data with a new cardiac arrhythmia detection algorithm, the original data is already gone.

This is where **Apache Kafka** becomes indispensable.

---

## What is Kafka: The Distributed Commit Log

Unlike traditional message brokers that act as temporary mailbox intermediaries, Kafka is structured as a **Distributed Commit Log**.

1. **Sequential Append-Only Writes**: Kafka stores messages by writing them sequentially and immutably to the end of a file on disk. This allows for extremely fast disk I/O operations (close to physical hardware limits) by avoiding random seeks on physical read heads.
2. **Persistent Messages**: Messages are not deleted after consumption. They only expire after a configurable retention period (e.g., 7 days) or total file size.
3. **Pointer-Based Consumption (Offsets)**: Each consumer is responsible for tracking where it left off reading (the `offset`). Multiple consumers can read the same data stream at different speeds without interfering with each other.

---

## Traditional Queues vs. Kafka

The table below contrasts the most relevant architectural differences in the teste context:

| Feature | Traditional Queues (RabbitMQ, SQS) | Apache Kafka (Commit Log) |
| :--- | :--- | :--- |
| **Consumption Pattern** | Destructive (reading deletes the message). | Non-destructive (multi-read and replay). |
| **Ordering** | Hard to guarantee under high concurrent consumer counts. | Strict per partition (guaranteed by key). |
| **Scalability** | Limited by queue state management. | Scales horizontally by adding partitions. |
| **Reprocessing** | Impossible if messages have already been consumed. | Fully supported by moving the offset backward. |

---

## Anatomy Applied to teste Signals

To understand how we will implement our infrastructure and APIs starting from Part 2, we need to align the fundamental concepts:

* **Topics**: The logical channel. We will have a topic named `teste.ecg.raw` to receive raw heartbeat data.
* **Partitions**: Physical divisions of a topic. A topic with 12 partitions distributes write traffic in parallel.
* **Partition Key**: Kafka guarantees that all messages with the same key always end up in the same partition. We will use `patient_id` as the key. Thus, the temporal order of a specific patient's heartbeats is 100% preserved in the assigned partition.
* **Consumer Groups**: Multiple Node.js processes join under the same group ID. Kafka balances partitions among them. If we have 4 consumers in the group, each reads 3 partitions in isolation.

---

## The Role of Node.js in Ingestion

The Node.js ecosystem, with its asynchronous event-loop-driven model, is excellent for handling high-concurrency I/O operations. It serves as the perfect gateway: it receives binary or JSON data via WebSocket/HTTP from local hospital sensors and publishes it very lightly and quickly to the Kafka cluster using the `kafkajs` library.

In the next article, we will configure our local environment with Docker Compose using the modern **Kafka KRaft** architecture (with no ZooKeeper dependency) and build our first Node.js client structuring the partition topology.
