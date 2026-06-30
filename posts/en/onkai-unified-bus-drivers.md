---
title: "Decoupled drivers:Abstracting NATS, RabbitMQ, and Kafka with a unified interface"
excerpt: "How can you switch between different messaging providers without changing a single line of business logic? Learn about onkai-unified-bus's decoupled driver design."
category: "Messaging"
date: "Mar 22, 2026"
readTime: "4 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The problem of broker coupling

Many engineering teams start their projects by coupling their business logic directly to a specific messaging client library (such as RabbitMQ's amqp driver or Kafka's sarama client). As the ecosystem grows, needs shift: perhaps Kafka is overkill for small microservices and you want NATS, or you need disk durability that simple NATS setups lack.

Migrating when your business logic is heavily coupled with the specific types and SDK methods of a particular broker is a tedious, error-prone refactoring nightmare.

To prevent this, **onkai-unified-bus** introduces a structured driver abstraction layer behind clean Go interfaces.

## Defining the unified contract

The key to transport decoupling is establishing cohesive behavioral contracts. The unified interface exposes the minimum common denominator of requirements for asynchronous messaging:

```go
type Message struct {
	ID      string
	Payload []byte
	Headers map[string]string
}

type Driver interface {
	Connect(ctx context.Context) error
	Publish(ctx context.Context, topic string, msg Message) error
	Subscribe(ctx context.Context, topic string, handler func(msg Message) error) error
	Close() error
}
```

## Managing physical connections and reconnections

Each concrete driver (e.g. `RabbitMQDriver`, `NATSDriver`) implements the interface above and takes full responsibility for managing its physical network connections.

For instance, the RabbitMQ driver listens to channel closed events (`amqp.Channel.NotifyClose`) in a background monitoring routine to automatically attempt reconnections on network dropouts, without exposing any of these internal mechanics to the application layers.

```go
func (d *RabbitMQDriver) handleReconnect(ctx context.Context) {
	for {
		select {
		case <-d.closeChan:
			return
		case err := <-d.conn.NotifyClose(make(chan *amqp.Error)):
			if err != nil {
				log.Println("RabbitMQ connection lost, attempting reconnect...")
				d.reconnect(ctx)
			}
		}
	}
}
```

### Technical terms demystified
- **Go Interfaces:** Types that define method signatures (behaviors). Any struct that implements these methods implicitly satisfies the interface.
- **Message Broker:** A middleware agent that translates and routes messages across distributed components (e.g., RabbitMQ, NATS, Kafka).
- **Decoupling:** The design practice of ensuring software components have little or no direct dependency on one another.
