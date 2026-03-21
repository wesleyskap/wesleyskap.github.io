---
title: "Flow Control and Backpressure: Preventing Memory Saturation in Event Consumption"
excerpt: "What do you do when consumers can't keep up with the speed of producers? Learn how to design resilient backpressure strategies using non-blocking buffers in Go."
category: "Messaging"
date: "Mar 21, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## The Phenomenon of Consumer Saturation

In any distributed or event-driven architecture, mismatching speeds between producers and consumers is inevitable. If your producer service generates 50,000 messages per second, but your downstream database or API integrated into the consumer can only handle 5,000 requests per second, system memory will quickly become a point of failure. Without structured flow control, local buffers will accumulate data indefinitely until an Out Of Memory (OOM) crash occurs.

To shield applications against these traffic surges, **onkai-unified-bus** implements robust **Backpressure** policies and non-blocking circular buffers.

## Control Policies: Blocking vs. Dropping

When an event reception channel reaches its maximum capacity (saturation), the event bus offers three configurable policies:

1.  **Block:** The producer goroutine is temporarily paused when attempting to publish new events. This naturally throttles the production rate until consumers drain the queue.
2.  **Drop Oldest:** The bus discards the oldest message in the queue to insert the new one, prioritizing fresh events and avoiding unbounded latency.
3.  **Drop Newest:** The current event is discarded immediately, returning a saturation error to the caller.

```go
type BackpressurePolicy int

const (
	PolicyBlock BackpressurePolicy = iota
	PolicyDropOldest
	PolicyDropNewest
)

func (b *Bus) Publish(topic string, data []byte, policy BackpressurePolicy) error {
	select {
	case b.inbox <- data:
		return nil
	default:
		switch policy {
		case PolicyBlock:
			b.inbox <- data // Blocks the producer goroutine until space is freed
			return nil
		case PolicyDropOldest:
			select {
			case <-b.inbox: // Discards the oldest item in the queue
			default:
			}
			b.inbox <- data // Insert the new data
			return nil
		case PolicyDropNewest:
			return ErrQueueSaturated
		}
	}
	return nil
}
```

## Channel-Based Circular Buffers

By leveraging Go's native buffered channels, the event bus performs these checks extremely efficiently without complex locks or slow custom queue structures. Using a simple `select` block without a default channel allows backpressure decisions to occur at the CPU level in nanoseconds.

### Technical Terms Demystified
- **Backpressure:** The resistance or force exerted in opposition to data flow, forcing the sending system to throttle its transmission rate.
- **Out Of Memory (OOM):** A critical state where the operating system terminates a process because it has consumed all available physical memory.
- **Buffered Channels:** Native Go queues with pre-allocated capacity that allow sending messages without blocking the sender until the buffer is full.
