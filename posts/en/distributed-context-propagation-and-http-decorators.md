---
title: "Distributed Context Propagation and Transport Resilience: W3C, B3, and HTTP Client Decorators"
excerpt: "How do you maintain telemetry tracking across remote HTTP boundaries? Learn how to propagate trace contexts using W3C and B3 headers by decorating Go's net/http standard library transparently."
category: "Connectivity"
date: "Feb 28, 2026"
readTime: "4 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## Telemetry Headers and Industry Standards

An isolated trace ID on a single server loses its value in a microservices architecture. When a user request travels across multiple services over the network, the trace correlation ID must be propagated from end to end. Without this, traceability is lost, making debugging distributed errors nearly impossible.

To unify telemetry propagation, Orkai fully supports two widely adopted industry standards:
- **W3C Trace Context:** Uses a single standardized header called `traceparent`, formatted as `version-traceID-spanID-flags` (e.g., `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`).
- **B3 Propagation:** A common standard in the Spring/Zipkin ecosystem, which propagates data using separate headers (`X-B3-TraceId`, `X-B3-SpanId`) or a single consolidated `b3` header.

We developed highly optimized parsers that decode these raw strings the moment a request enters our HTTP middlewares, binding the extracted Trace ID to the active goroutine scope.

```go
// Example of W3C Traceparent header parsing:
func parseW3C(header string) (string, bool) {
	parts := strings.Split(header, "-")
	if len(parts) < 4 {
		return "", false
	}
	// The second part represents the 32-character hexadecimal Trace ID
	traceID := parts[1]
	return traceID, true
}
```

## Decorating the Native Transport Interface (`http.RoundTripper`)

Forcing developers to manually inject Trace ID headers into every outbound HTTP request is a critical software engineering anti-pattern. It creates heavy coupling and introduces human error that can easily break telemetry correlation.

Go resolves this elegantly through the native `http.RoundTripper` interface, which defines the transport lifecycle for HTTP clients.

In Orkai, we implemented the **TracingRoundTripper**, a structure that acts as a decorator for the native transport interface. By configuring this custom transport on the standard Go HTTP client, every outbound call is automatically intercepted in the background. The decorator extracts the active Trace ID from our concurrent execution stack and injects the proper propagation headers into the request before network transmission, keeping the business logic completely clean of telemetry boilerplate.

```go
type TracingRoundTripper struct {
	next http.RoundTripper // The next round tripper in the transport chain (e.g. http.DefaultTransport)
}

func (t *TracingRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// Retrieve the active trace ID from the current LIFO execution stack
	activeID := observability.GetActiveTraceID()
	if activeID != "" {
		// Inject standard propagation headers before dispatching
		req.Header.Set("X-Trace-ID", activeID)
		req.Header.Set("traceparent", fmt.Sprintf("00-%s-%s-01", activeID, generateRandomSpanID()))
	}
	// Forward the decorated request to the next transport layer
	return t.next.RoundTrip(req)
}
```

### Technical Terms Explained
- **Context Propagation:** The protocol of converting, transmitting, and parsing telemetry context across microservice network boundaries.
- **RoundTripper:** A standard Go interface representing the capability to execute a single HTTP transaction, receiving a request and returning a response.
- **Decorator Pattern:** A structural design pattern that lets you dynamically attach new behaviors to objects by wrapping them in a compatible wrapper without altering their base code.
