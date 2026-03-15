---
title: "From Custom to Industry Standard: Histogram Percentiles and the OpenTelemetry Semantic Bridge"
excerpt: "Why do latency averages lie? Discover the mathematics behind computing long-tail percentiles and how we engineered a clean semantic bridge to support OpenTelemetry with concurrent double routing."
category: "Metrics & Tracing"
date: "Mar 14, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Statistical Illusion of the Mean and the Mathematics of Percentiles

Metrics calculated solely on the arithmetic mean lie heavily to reliability engineers. A web server can display an excellent average latency of 15ms, masking that 1% of its users face catastrophic delays of 5 seconds due to Garbage Collector pauses. To map long-tail quality of service, we must compute precise statistical percentiles (p50, p90, p99).

Computing exact percentiles over time would require storing all physical measurements indefinitely in RAM, leading to memory leaks and resource exhaustion in production.

To solve this problem, Orkai utilizes a memory-bounded structure called a **latencyReservoir**. It stores a fixed sliding window of samples (capped at 2000 float64 entries) in a concurrency-safe manner. To compute a percentile (e.g. p99), we isolate the internal slice using a thread-safe copy (`copy(sorted, r.samples)`) to avoid race conditions, sort the copied slice, and extract the value at the proportional index.

```go
func (r *latencyReservoir) extractPercentile(p float64) float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	n := len(r.samples)
	if n == 0 {
		return 0.0
	}
	// Create an isolated copy for safe sorting without corrupting concurrent memory
	sorted := make([]float64, n)
	copy(sorted, r.samples)
	sort.Float64s(sorted)

	idx := int(math.Ceil(p*float64(n))) - 1
	if idx < 0 {
		idx = 0
	} else if idx >= n {
		idx = n - 1
	}
	return sorted[idx]
}
```

## Semantic Bridges and Double Routing in OpenTelemetry

Most modern companies have standardized their observability stacks using the CNCF's **OpenTelemetry (OTel)** specification. However, refactoring every single legacy application to interface with the verbose OTel APIs is economically and technically unviable.

In Orkai, we solved this by developing lightweight semantic adapters (`NewOTelTracer` and `NewOTelMetrics`). They cleanly translate calls from our lightweight unified facades into native OpenTelemetry SDK structures.

Furthermore, we introduced **Double Routing**: when a latency metric is registered, our bridge forwards it simultaneously to both the remote OpenTelemetry Collector and the local `InMemoryMetrics` engine. This design allows you to keep scraping traditional `/metrics` via Prometheus for fast, low-overhead local dashboards, without degrading CPU performance or doubling processing latency.

[DIAGRAM_DOUBLE_ROUTING]

```go
type otelMetrics struct {
	mu          sync.Mutex
	meter       metric.Meter
	instruments map[string]interface{}
	localEngine *InMemoryMetrics // Primary local Prometheus collector
}

func (o *otelMetrics) RecordLatency(name string, val float64, labels map[string]string) {
	o.mu.Lock()
	// 1. Primary local routing
	o.localEngine.RecordLatency(name, val, labels)
	histogram := o.getOrCreateHistogram(name)
	o.mu.Unlock()

	// 2. Concurrent propagation to the native OpenTelemetry SDK
	ctx := context.Background()
	histogram.Record(ctx, val, metric.WithAttributes(convertLabels(labels)...))
}
```

### Technical Terms Explained
- **Outliers:** Experimental measurements or telemetry records that deviate drastically from the typical operational envelope (e.g. a 10s database query in a cluster of 2ms requests).
- **Percentile:** A statistical measure representing the threshold below which a given percentage of data falls. For instance, a p95 latency of 200ms means 95% of requests completed under 200ms.
- **Double Routing:** The technique of multiplexing a single stream of telemetry data to multiple independent endpoints concurrently without blocking the main execution path.
