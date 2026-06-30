---
title: "Zero-allocation dispatcher: Routing millions of events without heap allocations in C#"
excerpt: "How do you design a high-performance concurrent event dispatcher in memory? Discover how onkai-unified-bus leverages ObjectPool and System.Threading.Channels for GC-free throughput."
category: "Messaging"
date: "Mar 17, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The bottleneck of dynamic allocations in high-throughput event buses

In high-performance event-driven architectures, every microsecond counts. When implementing a local in-memory Event Bus in .NET, the most common pattern is allocating new message containers and wrapping delegates dynamically. While simple, this approach creates a large volume of short-lived objects on the heap. As a consequence, the Garbage Collector (GC) runs aggressively, causing gen-0/gen-1 collection overhead that degrades overall latency.

To solve this cleanly, **onkai-unified-bus** adopts a virtual zero-allocation strategy. By utilizing a high-performance, structured dispatch engine, it processes events via internally pooled message envelopes and concurrent channels, giving .NET developers maximum throughput with minimal memory footprint.

## Bootstrapping the event bus

The library exposes a fluent registration API for Microsoft Dependency Injection. Under the hood, this sets up the zero-allocation transport pipelines, pooled resources, and background workers automatically.

```csharp
using Microsoft.Extensions.DependencyInjection;
using Onkai.EventBus.Core.Extensions;
using Onkai.EventBus.RabbitMQ.Extensions;

var builder = WebApplication.CreateBuilder(args);

// Register Core EventBus infrastructure
builder.Services.AddEventBus()
                .UseRabbitMq(config =>
                {
                    config.HostName = "localhost";
                    config.UserName = "guest";
                    config.Password = "guest";
                });
```

## High-speed event publishing

Once configured, developers simply inject the thread-safe `IEventPublisher` interface to dispatch events. The framework takes care of acquiring a pooled wrapper envelope, serializing the event payload, and scheduling delivery via optimized pipelines:

```csharp
using Onkai.EventBus.Abstractions;

public sealed class OrderService
{
    private readonly IEventPublisher _publisher;

    public OrderService(IEventPublisher publisher)
    {
        _publisher = publisher;
    }

    public async Task CheckoutAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var orderEvent = new OrderCreatedEvent(orderId, 199.99m, "customer@example.com");

        // Dispatches the event through onkai-unified-bus high-performance engine
        await _publisher.PublishAsync(orderEvent, cancellationToken: cancellationToken);
    }
}
```

### Technical terms demystified
- **Heap:** The region of system memory where dynamically allocated data lives at runtime. Managing the heap and performing Garbage Collection is far more expensive than using the Stack.
- **ObjectPool:** A design pattern and .NET class that caches temporary objects for future reuse, reducing allocations.
- **System.Threading.Channels:** A set of APIs in .NET that provides a high-performance, zero-allocation producer-consumer queue for concurrent architectures.


