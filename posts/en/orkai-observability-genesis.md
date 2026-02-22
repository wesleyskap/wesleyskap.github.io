---
title: "Creating a High-Performance JSON Logger and a LIFO Tracer From Scratch in Go"
excerpt: "How can we correlate structured logs with complex execution scopes without cluttering business logic? Learn how to design a reflection-free Logger and a thread-safe concurrent LIFO tracer in Go."
category: "Concurrency & Architecture"
date: "Feb 22, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Anatomy of Reflection and the Hidden Heap Allocation Cost

In high-throughput systems, structured logging must never become a performance bottleneck. Most traditional Go JSON serialization libraries rely on the `reflect` package to dynamically inspect types and struct fields at runtime. While highly flexible, this process incurs frequent temporary memory allocations on the dynamic *heap*. As a result, the Go Garbage Collector (GC) runs constantly, inducing "stop-the-world" latency spikes that degrade API response times.

To achieve ultra-performance, the Orkai structured Logger eliminates reflection entirely. Instead, we use type switches to explicitly match native Go types and serialize fields directly into a sequential byte slice (`bytes.Buffer`). This approach ensures near-zero heap allocations.

Another critical optimization is **Sensitive Data Masking (PII / LGPD)**. To comply with privacy regulations without sacrifice, the Logger maintains a global list of sensitive keywords (such as `password`, `secret`, `cvv`) protected by a fast read/write lock (`sync.RWMutex`). If a sensitive key is detected during serialization, its value is immediately swapped for `"[MASKED]"` in the JSON output.

Furthermore, to allow log levels to be modified dynamically in production (e.g., changing from `INFO` to `DEBUG` during an incident) without causing concurrency race conditions, Orkai utilizes low-level atomic operations from `sync/atomic` (`atomic.StoreInt32` and `atomic.LoadInt32`), providing maximum speed and thread safety.

```go
// Reflection-free structured field serialization:
func writeFields(buf *bytes.Buffer, fields []Field) {
	for _, f := range fields {
		buf.WriteString(",")
		buf.WriteString("\"" + f.Key + "\":")
		if isSensitiveKey(f.Key) {
			buf.WriteString("\"[MASKED]\"")
			continue
		}
		if f.IsInt {
			buf.WriteString(strconv.FormatInt(f.IntValue, 10))
		} else {
			buf.WriteString("\"" + f.StrValue + "\"")
		}
	}
}
```

## Transparent LIFO Tracking via Thread-Safe Stack Collections

To correlate distributed logs, we must track the active execution scope. The standard approach forces developers to pass a `context.Context` object through every single function signature in the codebase. This pollutes business logic and generates massive boilerplate.

Orkai resolves this elegantly by managing the active scope using an underlying stack designed around the **LIFO (Last-In, First-Out)** principle, bound to the goroutine execution path.

When starting a new span via the unified interface facade (`StartSpan`), we generate a cryptographically secure Trace ID and push it onto the top of a slice. When completing the span (`EndSpan`), we pop the element from the top of the stack, automatically restoring the parent trace ID. To ensure absolute data safety in concurrent multi-threaded environments, all operations on the stack are protected by exclusive locks (`sync.Mutex`). In addition, for critical failures, the Logger dynamically inspects execution frames via `runtime.Callers` to automatically include a compact stack trace in the JSON output.

```go
type LocalTracer struct {
	mu     sync.Mutex // Protects the stack consistency from race conditions
	traces []string   // LIFO slice of active Trace IDs
}

func (t *LocalTracer) Push(traceID string) {
	t.mu.Lock()
	t.traces = append(t.traces, traceID)
	t.mu.Unlock()
}

func (t *LocalTracer) Pop() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.traces) == 0 {
		return ""
	}
	lastIdx := len(t.traces) - 1
	popped := t.traces[lastIdx]
	t.traces = t.traces[:lastIdx] // Remove the last inserted element (LIFO)
	return popped
}
```

### Technical Terms Explained
- **Reflection:** The ability of a program to inspect its own structural metadata at runtime. It is slow because it bypasses compile-time optimizations.
- **LIFO Stack:** A data structure where the last item added is the first one to be removed.
- **Atomic Operations:** Low-level CPU instructions executed in a single step, eliminating the need for heavy mutual exclusion locks (Mutexes) for simple variable reads and writes.
