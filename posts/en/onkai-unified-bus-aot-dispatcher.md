---
title: "Reflection-free dispatcher:Optimizing performance and supporting native AOT"
excerpt: "Dynamic reflection degrades Garbage Collector performance and breaks ahead-of-time compilation. Learn how we designed a reflection-free router in Go."
category: "Messaging"
date: "Apr 16, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 10
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The costs of dynamic dispatch and AOT compilation

In traditional messaging frameworks, when a new event arrives, the router must dynamically find which class or struct handles that message type. In most runtimes, this is done using **Reflection** to inspect types at runtime.

While simple and flexible, reflection introduces severe issues:
1. **Performance Overhead:** Dynamic inspections and method invocations allocate metadata on the *heap*, adding load to the garbage collector.
2. **Incompatibility with Native AOT (Ahead-of-Time):** AOT compilers prune unused code and metadata during build time to produce tiny binaries. Invoking code via dynamic reflection often fails or crashes in production.

The **onkai-unified-bus** solves this by replacing dynamic invocations with a statically-typed dispatcher using a concurrent cache of typed executors.

## Statically-typed consumer executors

Instead of using reflection to find and invoke the consumer method on every message, the framework registers generic executor objects during startup. The dispatcher delegates execution through static interfaces:

```go
package main

import (
	"context"
	"fmt"
	"sync"
)

// Consumer defines the contract for handling incoming events
type Consumer[T any] interface {
	Consume(ctx context.Context, event T) error
}

// ConsumerExecutor encapsulates statically-typed invocation to avoid reflection
type ConsumerExecutor interface {
	Execute(ctx context.Context, payload []byte) error
}

type TypedConsumerExecutor[T any] struct {
	consumer Consumer[T]
	decoder  func(data []byte) (T, error)
}

func (e *TypedConsumerExecutor[T]) Execute(ctx context.Context, payload []byte) error {
	event, err := e.decoder(payload)
	if err != nil {
		return err
	}
	return e.consumer.Consume(ctx, event)
}
```

## The reflection-free dispatch engine

Upon receiving a message, the dispatcher loads the matching executor from a thread-safe map (`sync.Map`) indexed by the event name, executing the interface call directly in nanoseconds:

```go
type EventDispatcher struct {
	executors sync.Map // Maps event names to ConsumerExecutors
}

func (d *EventDispatcher) RegisterConsumer(eventName string, executor ConsumerExecutor) {
	d.executors.Store(eventName, executor)
}

func (d *EventDispatcher) Dispatch(ctx context.Context, eventName string, payload []byte) error {
	execVal, exists := d.executors.Load(eventName)
	if !exists {
		return fmt.Errorf("no consumer registered for event: %s", eventName)
	}
	
	executor := execVal.(ConsumerExecutor)
	return executor.Execute(ctx, payload) // Direct static execution
}
```

### Technical terms demystified
- **Native AOT (Ahead-of-Time):** A compilation technology that compiles source code directly to native machine code at build time, bypassing JIT compilers or runtime interpreters.
- **Reflection-Free Dispatcher:** A routing pattern that uses static interfaces or pre-compiled delegates to invoke handlers without inspecting objects at runtime.
- **Type Casting:** Explicitly converting a generic interface or variable to its concrete structural type.
