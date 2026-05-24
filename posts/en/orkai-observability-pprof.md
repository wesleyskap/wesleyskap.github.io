---
title: "Automated Diagnostics: On-Demand Profiling with Auto-Triggered pprof"
excerpt: "Investigating CPU and memory spikes after a server crash is ineffective. Learn how to automate profiling on-demand using pprof in Go."
category: "Performance"
date: "May 24, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 16
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Challenge of Capturing Ephemeral Spikes

Sudden spikes in CPU utilization or memory allocations typically happen in fractions of a second during high traffic events. Trying to debug these issues retroactively by analyzing logs is often frustrating.

Go includes the built-in `pprof` tool for performing deep CPU and memory execution profiling. However, executing `pprof` manually requires developers to log in and trigger it exactly when the performance anomaly is occurring.

The **orkai-observability** package solves this by implementing an **Auto-Triggered** system that monitors resources and captures profiling diagnostics automatically.

## Designing the Auto-Triggered Profiler

We configure a background goroutine to monitor system metrics at intervals. If resource consumption crosses a configured threshold, the profiler automatically writes a `.pprof` file, managing a cooldown state to prevent system overload:

```go
package main

import (
	"context"
	"log"
	"os"
	"runtime"
	"runtime/pprof"
	"time"
)

type AutoProfiler struct {
	cpuThreshold     int
	lastTriggerTime time.Time
	cooldown         time.Duration
}

func NewAutoProfiler(cooldown time.Duration) *AutoProfiler {
	return &AutoProfiler{
		cooldown: cooldown,
	}
}

// CheckAndTriggerProfile monitors goroutine counts and initiates profiling if thresholds are breached
func (ap *AutoProfiler) CheckAndTriggerProfile(ctx context.Context) {
	numGoroutines := runtime.NumGoroutine()

	// If concurrency limit is breached (e.g. 5000 goroutines)
	if numGoroutines > 5000 {
		if time.Since(ap.lastTriggerTime) > ap.cooldown {
			ap.lastTriggerTime = time.Now()
			ap.captureCPUProfile()
		}
	}
}

func (ap *AutoProfiler) captureCPUProfile() {
	filename := "cpu_profile_" + time.Now().Format("20060102_150405") + ".pprof"
	f, err := os.Create(filename)
	if err != nil {
		log.Printf("[Profiler] Failed to create profile file: %v", err)
		return
	}
	defer f.Close()

	log.Printf("[Profiler] Starting automatic CPU profile capture: %s", filename)
	if err := pprof.StartCPUProfile(f); err == nil {
		time.Sleep(5 * time.Second) // Captures 5 seconds of CPU activity
		ppprof.StopCPUProfile()
		log.Println("[Profiler] CPU profile capture completed.")
	}
}
```

## The Role of Cooldown Management

Profiling introduces CPU and memory overhead. If your server is under load and goroutine counts spike, capturing profiles continuously without a cooldown period could exhaust the remaining resources of the machine. A cooldown ensures diagnostics are gathered safely and conservatively.

### Technical Terms Demystified
- **pprof:** A native Go runtime tool for collecting, visualizing, and inspecting performance data (CPU time, heap memory, and lock contention).
- **Profiling:** The process of analyzing a program's runtime execution behavior to measure CPU or memory utilization at the function level.
- **Cooldown:** A configured time buffer that must elapse before a high-cost automated action can be executed again.
---
