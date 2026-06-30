---
title: "Asynchronous tracing:Propagating telemetry context across event boundaries"
excerpt: "How do you track distributed execution flows through asynchronous queues without losing correlation? Learn how to inject and extract trace contexts in message headers."
category: "Messaging"
date: "Mar 28, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The challenge of tracing asynchronous pipelines

In traditional synchronous microservice architectures (like HTTP or gRPC), propagating trace contexts to assemble call trees is straightforward. Requests carry trace data directly inside standard headers.

However, in event-driven systems, this execution flow is decoupled. A producer publishes a message to a broker and immediately finishes its task. Seconds or minutes later, a consumer pulls the message and processes it. How do you correlate the telemetry of the consumer with the original transaction initiated by the producer?

**onkai-unified-bus** solves this by injecting and extracting W3C Trace Context headers transparently inside the physical metadata headers of every message.

## Injecting and extracting trace context

To ensure compatibility with industry-leading observability tools (such as OpenTelemetry, Jaeger, and Zipkin), the bus exposes injection and extraction adapters conforming to the W3C standard.

```go
import (
	"context"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// InjectTrace injects active trace context data into the message headers
func InjectTrace(ctx context.Context, msg *Message) {
	propagator := otel.GetTextMapPropagator()
	carrier := propagation.MapCarrier(msg.Headers)
	propagator.Inject(ctx, carrier)
}

// ExtractTrace extracts trace context data from the message headers and returns a new context.Context
func ExtractTrace(ctx context.Context, msg Message) context.Context {
	propagator := otel.GetTextMapPropagator()
	carrier := propagation.MapCarrier(msg.Headers)
	return propagator.Extract(ctx, carrier)
}
```

## End-to-end visual correlation

When a producer creates an event, the active Span ID is serialized into the message's `traceparent` header. When the event reaches the transport driver (e.g. RabbitMQ), the consumer's middleware intercepts it, extracts the context using `ExtractTrace`, and spawns a child Span under the original parent trace.

Thanks to this mechanism, even if an event is deferred and processed long after it was generated, your APM dashboards will show the exact correlation graph across all distributed systems.

### Technical terms demystified
- **W3C Trace Context:** A unified standard defining mandatory headers (`traceparent`, `tracestate`) to guarantee tracing interoperability across heterogeneous services.
- **Span ID:** A unique identifier representing a single logical unit of work (such as a database query or message handling block).
- **Map Carrier:** A utility adapter that maps OpenTelemetry fields into standard string-to-string dictionary headers.
