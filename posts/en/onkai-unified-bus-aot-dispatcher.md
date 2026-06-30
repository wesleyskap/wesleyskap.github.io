---
title: "Reflection-free dispatcher: Optimizing performance and supporting native AOT"
excerpt: "Dynamic reflection degrades Garbage Collector performance and breaks ahead-of-time compilation. Learn how we designed a reflection-free router in C#."
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
2. **Incompatibility with Native AOT (Ahead-of-Time):** AOT compilers prune unused code and metadata during build time to produce tiny binaries. Invoking code via dynamic reflection often fails or crashes in production because the compiler cannot predict what will be dynamically inspected.

The **onkai-unified-bus** solves this by replacing dynamic invocations with a statically-typed dispatcher using a concurrent cache of typed executors.

## Statically-typed consumer executors

Instead of using reflection to find and invoke the consumer method on every message, the framework registers generic executor objects during startup. The dispatcher delegates execution through static interfaces:

```csharp
using Onkai.EventBus.Abstractions;

namespace Onkai.EventBus.Core.Subscription;

// Defines a contract to dispatch events to untyped consumer instances without using reflection invocation.
internal interface IEventConsumerExecutor
{
    Task ExecuteAsync(object consumer, IEvent @event, ConsumeContext context, CancellationToken cancellationToken);
}

// A generic helper that casts untyped inputs and executes the strongly-typed ConsumeAsync method directly.
internal sealed class EventConsumerExecutor<TEvent> : IEventConsumerExecutor
    where TEvent : IEvent
{
    public Task ExecuteAsync(object consumer, IEvent @event, ConsumeContext context, CancellationToken cancellationToken)
    {
        if (consumer == null) throw new ArgumentNullException(nameof(consumer));
        if (@event == null) throw new ArgumentNullException(nameof(@event));

        var typedConsumer = (IEventConsumer<TEvent>)consumer;
        var typedEvent = (TEvent)@event;

        return typedConsumer.ConsumeAsync(typedEvent, context, cancellationToken);
    }
}
```

## The reflection-free dispatch engine

Upon receiving a message, the dispatcher loads the matching executor from a thread-safe map (`ConcurrentDictionary`) cached by event type, executing the interface call directly in nanoseconds:

```csharp
using System.Collections.Concurrent;
using Onkai.EventBus.Abstractions;

public sealed class RabbitMqConsumer
{
    private readonly ConcurrentDictionary<Type, IEventConsumerExecutor> _executors = new();

    private async Task ExecuteConsumerAsync(Type eventType, object consumerInstance, IEvent eventData, ConsumeContext context, CancellationToken token)
    {
        // Get or add the cached compiled executor statically without reflection lookup
        var executor = _executors.GetOrAdd(eventType, t =>
        {
            var executorType = typeof(EventConsumerExecutor<>).MakeGenericType(t);
            return (IEventConsumerExecutor)Activator.CreateInstance(executorType)!;
        });

        await executor.ExecuteAsync(consumerInstance, eventData, context, token);
    }
}
```

### Technical terms demystified
- **Native AOT (Ahead-of-Time):** A compilation technology that compiles source code directly to native machine code at build time, bypassing JIT compilers or runtime interpreters.
- **Reflection-Free Dispatcher:** A routing pattern that uses static interfaces or pre-compiled delegates to invoke handlers without inspecting objects at runtime.
- **Type Casting:** Explicitly converting a generic interface or variable to its concrete structural type.

