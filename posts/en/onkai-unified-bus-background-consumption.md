---
title: "Background message consumption:Designing a resilient hosted service"
excerpt: "How do you run continuous and asynchronous message consumption without blocking the application's main thread? Design a resilient background worker."
category: "Messaging"
date: "Apr 08, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The importance of isolated asynchronous processing

In modern microservices, web servers handle fast, short-lived HTTP requests. However, consuming messages from queues or topics (such as RabbitMQ, Kafka, or NATS) requires a different runtime model: continuous and asynchronous listening. This message consumption loop cannot run on the same thread as web requests, otherwise, it would freeze the main web server.

To solve this, **onkai-unified-bus** implements a background execution engine (Worker/Background Service) that manages the message consumption lifecycle in an isolated and resilient manner.

## Implementing a background consumption worker

The background worker encapsulates the infinite listening loop of the transport broker. It boots alongside the application container startup and ensures correct handling of termination signals using cancellation contexts (`context.Context`):

```go
package main

import (
	"context"
	"log"
	"sync"
	"time"
)

type MessageConsumer struct {
	driver    Driver
	topic     string
	stopChan  chan struct{}
	waitGroup sync.WaitGroup
}

func NewMessageConsumer(driver Driver, topic string) *MessageConsumer {
	return &MessageConsumer{
		driver:   driver,
		topic:    topic,
		stopChan: make(chan struct{}),
	}
}

// Start spawns the goroutine that consumes messages asynchronously
func (mc *MessageConsumer) Start(ctx context.Context) {
	mc.waitGroup.Add(1)
	go func() {
		defer mc.waitGroup.Done()
		log.Printf("[Consumer] Starting subscription on topic: %s", mc.topic)

		err := mc.driver.Subscribe(ctx, mc.topic, func(msg Message) error {
			// Simulates message processing logic
			log.Printf("[Consumer] Processing message: %s", msg.ID)
			return nil
		})

		if err != nil {
			log.Printf("[Consumer] Topic subscription error: %v", err)
		}
	}()
}

// Stop gracefully stops the consumer, draining active processing execution
func (mc *MessageConsumer) Stop() {
	close(mc.stopChan)
	mc.waitGroup.Wait()
	log.Println("[Consumer] Graceful shutdown completed.")
}
```

## Failure handling and connection lifecycle

A production background worker must not crash the application if the network connection with the broker flickers. The consumption layer integrates with the driver to automatically re-establish the subscription after disconnections:
- Continuous physical connection monitoring.
- On-demand topology declaration (re-declaring queues if deleted).
- Cooperative cancellation with `context.Context` during machine shutdowns.

### Technical terms demystified
- **Background Service:** A process executed in the background that performs continuous tasks (like reading a queue) without direct client interaction.
- **Graceful Drain:** The process of stopping the intake of new events and waiting for active messages to complete before terminating the process.
- **Cooperative Cancellation:** A pattern where parallel routines monitor a centralized signal (like a context or channel) to immediately stop execution.
