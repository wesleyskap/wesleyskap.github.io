---
title: "Scheduled and delayed messages:Routing with TTL and dead-letter exchange in RabbitMQ"
excerpt: "Need to delay message delivery by a few minutes without using additional plugins in RabbitMQ? Learn how to use TTL and Dead-Letter Exchanges."
category: "Messaging"
date: "Apr 14, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The challenge of scheduling events without plugins

Often, we need to delay message delivery in our messaging architectures: for example, sending a reminder email 2 hours after account creation, or retrying a temporarily failed transaction after a planned 10-minute delay.

While RabbitMQ offers an official delayed messages plugin (`rabbitmq-delayed-message-exchange`), it is not always available or permitted in managed cloud environments (like AWS Amazon MQ).

The **onkai-unified-bus** bypasses this limitation by designing a native topology based on message **Time-To-Live (TTL)** expiration directed toward a **Dead-Letter Exchange (DLX)**.

## The delayed message routing flow

To delay a message, we create an indirect routing flow:
1. Publish the event to a temporary queue that has **no active consumers**.
2. Configure a `x-message-ttl` limit on this queue equivalent to the desired delay.
3. Configure a Dead-Letter Exchange (`DLX`) pointing to the final target exchange.
4. When the TTL expires, RabbitMQ automatically evicts the message from the temporary queue and routes it to the exchange configured in the DLX.

```go
package main

import (
	"context"
	"fmt"
	"github.com/rabbitmq/amqp091-go"
)

// SetupDelayedTopology declares a consumer-less queue with TTL and DLX arguments
func SetupDelayedTopology(ch *amqp091_go.Channel, delayMs int) (string, error) {
	delayQueueName := fmt.Sprintf("delay-queue-%dms", delayMs)
	
	// Declares the queue with specific TTL and DLX configurations
	_, err := ch.QueueDeclare(
		delayQueueName,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		amqp091_go.Table{
			"x-message-ttl":             int32(delayMs),       // Retention period
			"x-dead-letter-exchange":    "main-event-exchange", // Destination post expiration
			"x-dead-letter-routing-key": "notifications.send",
		},
	)
	return delayQueueName, err
}
```

## Benefits of the native approach

Using this routing pattern:
- Eliminates dependencies on third-party broker plugins.
- Leverages the native persistence and reliability guarantees of the RabbitMQ engine.
- Supports varied delay durations by declaring queues with specific TTLs on the fly.

### Technical terms demystified
- **TTL (Time-To-Live):** The maximum period of time a message can remain in a queue before being discarded or moved to a dead-letter exchange.
- **Dead-Letter Exchange (DLX):** A normal RabbitMQ exchange where expired, rejected, or failed messages are routed automatically.
- **Delayed Topology:** An arrangement of exchanges and queues configured to temporarily hold messages for a controlled time.
