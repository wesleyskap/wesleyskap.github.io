---
title: "Runtime telemetry:Building a system resource collector for the Go runtime"
excerpt: "How do you monitor actual memory consumption, Garbage Collector pauses, and active goroutines in Go? Create a background resource collector."
category: "Metrics & Tracing"
date: "Apr 27, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The importance of monitoring runtime health

To ensure the reliability of APIs, monitoring HTTP status codes (such as 200s or 500s) is not enough. A microservice can be responding successfully while silently suffering from memory leaks or **Goroutine Leaks**, preparing the ground for an unexpected Out-of-Memory (OOM) crash.

To anticipate and diagnose these bottlenecks, the **orkai-observability** package includes a background worker designed to collect and expose Go runtime health metrics.

## Extracting stats with runtime.memstats

Go provides the native `runtime` package to extract statistics about heap memory allocations, active stacks, and Garbage Collector cycles:

```go
package main

import (
	"context"
	"log"
	"runtime"
	"time"
)

type ResourceCollector struct {
	interval time.Duration
}

func NewResourceCollector(interval time.Duration) *ResourceCollector {
	return &ResourceCollector{interval: interval}
}

// Start collects and logs runtime metrics periodically
func (c *ResourceCollector) Start(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)

				numGoroutines := runtime.NumGoroutine()
				heapAllocMB := float64(m.HeapAlloc) / 1024 / 1024
				gcRuns := m.NumGC

				log.Printf("[Telemetry] Goroutines: %d | Heap Alloc: %.2f MB | Total GC Runs: %d", 
					numGoroutines, heapAllocMB, gcRuns,
				)
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}
```

## Exposing telemetry for dashboards

These metrics are exposed via our scrapable `/metrics` endpoint in the standard Prometheus format, enabling long-term Grafana visualizations:
- **`go_goroutines`:** Instant count of active goroutines on the CPU scheduler.
- **`go_memstats_heap_alloc_bytes`:** Current heap memory bytes allocated in dynamic memory.
- **`go_gc_duration_seconds`:** A distribution of pauses introduced by Garbage Collector cycles.

### Technical terms demystified
- **Goroutine Leak:** A programming bug where goroutines are created but never terminated, consuming memory indefinitely.
- **Memory Leak:** Memory allocations on the heap that lose all references but cannot be reclaimed by the garbage collector.
- **MemStats:** A native Go struct containing statistics about the memory allocator's internals.
