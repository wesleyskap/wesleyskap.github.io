---
title: "Extreme resilience:Jittered backoff, storage circuit breaker, and embedded SPA dashboard"
excerpt: "Network partitions and database overloads happen. Learn how Runiq protects your infrastructure using Jitter, client-side Circuit Breakers, and real-time observability."
category: "Operações & Resiliência"
date: "June 24, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Designing for inevitable failure

In production systems, failure is a guarantee. External APIs experience downtime, databases suffer CPU spikes, and network packets are dropped.

A mature background job processor must be aggressively defensive. It must ensure that transient errors in worker execution do not cause cascade failures on the primary database, nor create "thundering herd" bottlenecks.

**Orkai Runiq** implements three state-of-the-art resilience and visibility mechanisms to handle degraded environments:
1.  **Exponential Backoff with Jitter:** Intelligent task retries.
2.  **Storage Circuit Breaker:** Active database protection on the client side.
3.  **Embedded SPA Dashboard:** Real-time visibility and dead-letter queue management.

---
## Intelligent task retries:Exponential backoff and jitter

When a worker task returns a non-nil `error` in its `Perform(ctx, args)` execution, Runiq calculates a wait delay before rescheduling the task.

The logic is defined in `queue/helpers.go`:

```go
func ComputeBackoffDelay(attempts int) time.Duration {
	delaySec := (1 << uint(attempts)) * 10
	if delaySec > 3600 {
		delaySec = 3600 // Capped at 1 hour max
	}
	jitterSec := time.Now().Nanosecond() % 3
	return time.Duration(delaySec+jitterSec) * time.Second
}
```

### Why add jitter?
If 100 jobs fail concurrently due to a transient 5-second database network partition, and we retry them using a strict exponential formula (`attempts * 10`), all 100 jobs will retry in the exact same second in the future. This creates a massive retry spike.

By introducing **Jitter** (a small random or pseudo-random time delta, like `time.Now().Nanosecond() % 3`), we scatter the retry executions over a wider window. This micro-offset smooths out resource utilization on downstream servers.

---
## Database protection:Client-side storage circuit breaker

If your database becomes overloaded (for example, due to a massive analytical query running in parallel), spamming new enqueue calls will only worsen the situation.

To protect the storage engine from total collapse, Runiq's client (`queue/client.go` and `queue/circuit_breaker.go`) implements an integrated **Circuit Breaker**:

```go
type CircuitBreakerConfig struct {
	Cooldown         time.Duration
	LatencyThreshold time.Duration
	FailureThreshold int
}
```

### Circuit breaker states:
*   **Closed:** Normal operation. Jobs are written to the database.
*   **Open:** If database query latency exceeds `LatencyThreshold` or sequential write errors exceed `FailureThreshold`, the circuit breaker trips open. New enqueue calls fail immediately in-memory with `ErrCircuitBreakerOpen` without touching the database, giving it time to recover.
*   **Half-Open:** After the `Cooldown` period, Runiq permits a few trial queries. If they succeed, it closes the circuit; if they fail, it trips back open.

---
## The embedded SPA dashboard (zero dependencies)

Even the best resilience strategy is useless if the operations team is blind. Runiq includes a native HTTP server (`queue/server.go`) that serves an embedded Single Page Application (SPA) dashboard compiled directly into the Go binary using `embed.FS`.

This interface displays key metrics and lists all tasks grouped by state (Pending, Active, Processed, and Dead). When a task fails permanently and is moved to the **Dead Letter Queue (DLQ)**, the dashboard displays the exact stack trace captured during the failure.

Through the dashboard or the integrated REST API, administrators can:
1.  **Pause and resume** individual queues under stress.
2.  **Reprocess (Redrive)** DLQ jobs in bulk.
3.  **Cancel** pending tasks and manage dynamic cron jobs.

The dashboard requires no external Node.js installations, bundlers, or CDNs. Everything is built with vanilla CSS/JS and embedded natively, keeping Runiq's footprint zero-dependency.

---
## Technical terms demystified

*   **Jitter:** The practice of adding random variance to retry intervals to prevent multiple clients or workers from synchronizing their execution.
*   **Circuit Breaker:** A software design pattern that detects failures and blocks attempts to perform operations that are highly likely to fail, protecting resource availability.
*   **Dead Letter Queue (DLQ):** A holding area where message brokers place messages or tasks that could not be processed successfully, facilitating offline inspection.
