---
title: "Zero-allocation dispatcher:Routing millions of events without heap allocations in Go"
excerpt: "How do you design a high-performance concurrent event dispatcher in memory? Discover how onkai-unified-bus leverages sync.Pool and worker pooling for GC-free throughput."
category: "Messaging"
date: "Mar 17, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The bottleneck of dynamic allocations in high-throughput event buses

In high-performance event-driven architectures, every microsecond counts. When implementing a local in-memory Event Bus in Go, the most common pattern is spawning dynamic goroutines and allocating data slices for each published message. While simple, this approach creates a large volume of short-lived objects on the heap. As a consequence, the Garbage Collector (GC) runs aggressively, causing stop-the-world pauses that degrade overall latency.

To solve this cleanly, **onkai-unified-bus** adopts a virtual zero-allocation strategy. Instead of allocating new data structures for every dispatched event, we reuse existing structures and maintain a fixed pool of concurrent workers.

## Recycling resources with sync.pool

The secret to avoiding heap allocations in Go is recycling objects via the `sync.Pool` package. We create a pool of reusable objects to wrap our event envelopes. Once an event is fully processed by consumers, we clear the envelope's data and return it to the pool.

```go
type EventEnvelope struct {
	Topic   string
	Payload []byte
	Headers map[string]string
}

var envelopePool = sync.Pool{
	New: func() interface{} {
		return &EventEnvelope{
			Headers: make(map[string]string),
		}
	},
}

func AcquireEnvelope(topic string, payload []byte) *EventEnvelope {
	env := envelopePool.Get().(*EventEnvelope)
	env.Topic = topic
	env.Payload = payload
	return env
}

func ReleaseEnvelope(env *EventEnvelope) {
	env.Topic = ""
	env.Payload = nil
	for k := range env.Headers {
		delete(env.Headers, k)
	}
	envelopePool.Put(env)
}
```

## Pooling concurrent workers

Instead of spawning a new goroutine for every message (which consumes CPU overhead and dynamic scheduling time), `onkai-unified-bus` initializes a static set of concurrent workers during startup. Each worker listens to an internal dispatcher channel and processes messages sequentially and extremely fast, ensuring that the memory footprint of the event bus remains completely flat, regardless of incoming event throughput.

### Technical terms demystified
- **Heap:** The region of system memory where dynamically allocated data lives at runtime. Managing the heap is far more expensive than using the Stack.
- **sync.Pool:** A native Go synchronization structure that caches temporary objects for future reuse, reducing garbage collector overhead.
- **Worker Pool:** A concurrent design pattern where a predefined group of processes or threads wait for tasks in a shared queue.
