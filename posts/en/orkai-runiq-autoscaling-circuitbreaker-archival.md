---
title: "Autoscaling, circuit breaker, and cold storage:Automated operational resilience in runiq"
excerpt: "Traffic spikes, database failures, and old job accumulation are inevitable. See how Runiq auto-scales workers, protects itself from degradation, and archives what's no longer needed."
category: "Operations & Resilience"
date: "July 7, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Autonomous production operations

Keeping a job processor healthy in production requires constant decisions: how many workers to run? What to do when the database slows down? How to handle millions of accumulated processed jobs?

Orkai Runiq solves all three problems with native mechanisms that operate autonomously, without manual intervention or external scripts.

---

## Dynamic worker autoscaling

Instead of fixing the worker pool goroutine count, Runiq allows configuring an **autoscaler** that adjusts concurrency based on queue depth:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithDynamicConcurrency(queue.DynamicConcurrencyConfig{
		CheckInterval:   5 * time.Second,
		MinConcurrency:  2,
		MaxConcurrency:  50,
		QueueDepthLimit: 100,
		ScaleUpStep:     5,
		ScaleDownStep:   2,
	}),
)
```

### The scaling algorithm

The autoscaler loops every `CheckInterval`, monitoring the total pending jobs across monitored queues:

```go
func (w *WorkerPool) runAutoscaleIteration(ctx context.Context) {
	pending, err := w.getMonitoredPendingCount(ctx)
	if err != nil {
		return
	}
	curr := w.currentConcurrency
	up, down := w.getAutoscaleSteps()
	if pending > w.autoscale.QueueDepthLimit {
		w.adjustConcurrency(curr + up) // scale up
		return
	}
	if pending == 0 {
		w.adjustConcurrency(curr - down) // scale down
	}
}
```

The implementation uses a channel-based semaphore (`chan struct{}`). Scaling up consumes tokens from the semaphore (freeing goroutines to work); scaling down returns tokens (reducing active workers):

```go
func (w *WorkerPool) setupSemaphore() {
	if w.autoscale == nil {
		w.sem = make(chan struct{}, w.concurrency)
		w.currentConcurrency = w.concurrency
		return
	}
	w.sem = make(chan struct{}, w.autoscale.MaxConcurrency)
	w.currentConcurrency = w.autoscale.MinConcurrency
	// Pre-fill with the difference to limit initial concurrency
	diff := w.autoscale.MaxConcurrency - w.autoscale.MinConcurrency
	for i := 0; i < diff; i++ {
		w.sem <- struct{}{}
	}
}
```

The pool starts with the minimum number of workers and auto-scales under load, wasting no resources during idle periods.

---

## Client-side circuit breaker

When the database is under stress, enqueuing more jobs only makes things worse. Runiq implements a **circuit breaker** on the client side that fails fast when it detects degradation:

```go
client := queue.NewClient(storage,
	queue.WithCircuitBreaker(queue.CircuitBreakerConfig{
		Cooldown:         30 * time.Second,
		LatencyThreshold: 500 * time.Millisecond,
		FailureThreshold: 5,
	}),
)
```

### The state machine

The circuit breaker manages three states protected by `sync.RWMutex`:

```go
func (cb *circuitBreaker) beforeCall() error {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if cb.state == cbStateOpen {
		if time.Since(cb.lastStateChg) > cb.config.Cooldown {
			cb.state = cbStateHalfOpen
			cb.lastStateChg = time.Now()
			return nil
		}
		return ErrCircuitBreakerOpen // fast fail
	}
	return nil
}

func (cb *circuitBreaker) afterCall(err error, elapsed time.Duration) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	isFail := err != nil ||
		(cb.config.LatencyThreshold > 0 && elapsed > cb.config.LatencyThreshold)
	if isFail {
		cb.failures++
		// Transition to OPEN when threshold is reached
	} else {
		cb.failures = 0
	}
}
```

1. **CLOSED:** Operations flow normally. Failures or high latencies increment the counter.
2. **OPEN:** After `FailureThreshold` failures, the circuit opens. `beforeCall()` returns `ErrCircuitBreakerOpen` instantly.
3. **HALF-OPEN:** After `Cooldown`, one test call is allowed. If successful, the circuit closes.

This protects the database from receiving unnecessary writes when it's already degraded, preventing cascading failures.

---

## Automated cold storage (job archival)

Accumulated processed and dead jobs make tables heavy and degrade dequeue queries. Runiq offers **automatic archival** that moves old jobs to an archive table:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithJobArchival(7*24*time.Hour, 1*time.Hour),
)
```

The process runs only on the leader node and executes an atomic copy-and-delete transaction:

```go
func (p *PostgresStorage) ArchiveJobs(ctx context.Context, age time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-age)
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	ins := `INSERT INTO runiq_archived_jobs
		SELECT * FROM runiq_jobs
		WHERE status IN ('processed', 'dead') AND updated_at <= $1
		ON CONFLICT (job_id) DO NOTHING`
	if _, err = tx.ExecContext(ctx, p.q(ins), cutoff); err != nil {
		return 0, err
	}
	del := `DELETE FROM runiq_jobs
		WHERE status IN ('processed', 'dead') AND updated_at <= $1`
	res, err := tx.ExecContext(ctx, p.q(del), cutoff)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	return rows, tx.Commit()
}
```

Jobs older than 7 days are moved to `runiq_archived_jobs` (available for auditing) and removed from the active table, keeping dequeue queries fast regardless of historical volume.

---

## Technical terms demystified

*   **Autoscaling:** Dynamic adjustment of the number of concurrent workers based on load metrics such as pending queue depth.
*   **Circuit Breaker:** A resilience pattern that temporarily halts failure-prone operations to allow the downstream system to recover.
*   **Cold Storage / Job Archival:** Migration of old records from an active operational table to an archive table, reducing data volume in critical queries while maintaining audit traceability.
