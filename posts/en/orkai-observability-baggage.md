---
title: "Baggage propagation:Sharing business metadata across microservices via W3C standard"
excerpt: "Telemetry traces only link function calls. Learn how to use W3C Baggage to propagate business metadata across your entire microservices mesh."
category: "Connectivity"
date: "May 03, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 10
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## Tracing vs. baggage:Concept differences

In distributed observability, tracing identifiers (`Trace ID` and `Span ID`) construct the physical path of a request as it navigates microservices. They illustrate call order and identify bottlenecks.

However, we often need to share business metadata (such as Customer ID, Active Tier, or Organization ID) globally across microservices without modifying API signatures to pass these arguments manually.

The **W3C Baggage** standard solves this by allowing you to carry a map of key-value pairs through HTTP request headers transparently.

## How W3C baggage works

W3C defines the `baggage` header as a comma-separated list of key-value pairs (e.g., `customerId=alice,tenant=premium`). The **orkai-observability** package implements a parser to read and propagate this context:

```go
package main

import (
	"context"
	"strings"
)

type baggageKey struct{}

// ContextWithBaggage stores business metadata map in the context.Context
func ContextWithBaggage(ctx context.Context, baggage map[string]string) context.Context {
	return context.WithValue(ctx, baggageKey{}, baggage)
}

// BaggageFromContext extracts the baggage metadata from the context
func BaggageFromContext(ctx context.Context) map[string]string {
	if val, ok := ctx.Value(baggageKey{}).(map[string]string); ok {
		return val
	}
	return make(map[string]string)
}

// ParseBaggageHeader decodes the raw W3C Baggage header string
func ParseBaggageHeader(header string) map[string]string {
	baggage := make(map[string]string)
	if header == "" {
		return baggage
	}
	pairs := strings.Split(header, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(strings.TrimSpace(pair), "=", 2)
		if len(kv) == 2 {
			baggage[kv[0]] = kv[1]
		}
	}
	return baggage
}
```

## Automated HTTP propagation

When using `TracingRoundTripper` in our HTTP clients, the outbound wrapper reads the active Baggage map from the context and injects it into the outbound request headers. Upon receiving the call, the target service's middleware parses the header and reconstructs the context, preserving business details across microservice boundaries.

### Technical terms demystified
- **W3C Baggage:** An industry standard defining HTTP headers for transmitting contextual metadata not related to the trace tree (like tenant or customer info).
- **Context-Aware Mapping:** The process of storing and retrieving map objects dynamically within Go's native `context.Context`.
- **Service Mesh:** A network infrastructure layer dedicated to managing and monitoring communication between microservices.
