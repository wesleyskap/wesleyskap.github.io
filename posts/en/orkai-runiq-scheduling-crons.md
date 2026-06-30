---
title: "Distributed scheduling & crons:Solving the double-execution problem"
excerpt: "How do you guarantee a Cron task runs exactly once per minute across a cluster of servers without a coordinator like ZooKeeper? Learn the mechanics behind Orkai Runiq."
category: "Sistemas Distribuídos"
date: "June 29, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## The scheduler challenge in clusters

Scheduling a task to execute at a specific future timestamp (e.g., `client.EnqueueIn(ctx, ..., 10*time.Minute)`) is relatively straightforward. You persist the execution timestamp (`run_at`) in your database and use a periodic polling loop to fetch and process jobs where `run_at <= CURRENT_TIMESTAMP`.

The real complexity arises with **recurring tasks (Cron Jobs)** running in a distributed infrastructure (for instance, multiple replica pods of your application running in Kubernetes). If each replica runs an independent internal timer based on its local server clock, when the clock strikes midnight (`00:00`), **every replica will trigger the same job simultaneously**. This leads to duplicate reports, double-billing operations, or spamming users with repeated emails.

To solve this cleanly without adding heavy distributed consensus layers (such as Consul or Apache ZooKeeper), Runiq implements an elegant, database-driven distributed lock mechanism.

---
## The cron engine and the minute-level distributed lock

In Runiq, cron synchronization relies on a **minute-level database lock**.

Every 10 seconds, the worker pool's internal scheduler ticks to evaluate if any registered cron expressions match the current time. When a match is found, the worker replica attempts to acquire an exclusive lock for that specific cron job and the current minute (with seconds truncated).

Here is how this is orchestrated in the PostgreSQL driver (`queue/postgres_process.go`):

```go
func (p *PostgresStorage) LockCronExecution(ctx context.Context, cronName string, executionMinute time.Time) (bool, error) {
	// Purge stale locks to keep the table clean
	_, _ = p.db.ExecContext(ctx, p.q("DELETE FROM runiq_cron_locks WHERE execution_minute < $1"), time.Now().Add(-1*time.Hour))
	
	// Attempt to insert the lock row for the truncated minute
	res, err := p.db.ExecContext(ctx, p.q(`
		INSERT INTO runiq_cron_locks (cron_name, execution_minute, acquired_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (cron_name, execution_minute) DO NOTHING`),
		cronName, executionMinute.Truncate(time.Minute), time.Now(),
	)
	if err != nil {
		return false, err
	}
	
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}
```

### The power of on conflict do nothing
The `runiq_cron_locks` table enforces a unique constraint on `(cron_name, execution_minute)`.

1.  **The Race:** If the `"DailyReport"` cron triggers at midnight, all 5 worker replicas will call `LockCronExecution` with the timestamp `2026-06-24 00:00:00` (truncated to the minute).
2.  **The Winner:** The first replica request that reaches the database inserts the row and returns `1` row affected (`rows > 0`). This worker proceeds to enqueue the job.
3.  **The Losers:** The remaining 4 concurrent requests hit the unique constraint. The database executes the `ON CONFLICT DO NOTHING` clause, skipping the insertion without raising an error. Runiq detects `rows == 0` and aborts the enqueuing phase on those replicas.

This simple design pattern prevents duplicate enqueues with transactional guarantees, leveraging database indexing efficiency.

---
## Static vs. dynamic crons with timezone support

To provide maximum operational flexibility, Runiq supports two modes of Cron jobs:

1.  **Static Crons (Code-Defined):** Registered during worker pool bootstrapping. These are immutable and ideal for system maintenance tasks:
    ```go
    pool.RegisterCron("*/15 * * * *", "default", "CleanupSession", []byte(`{}`))
    ```
2.  **Dynamic Crons (Dashboard/API Defined):** Persisted in the `runiq_cron_jobs` table. They can be paused, updated, created, or deleted dynamically via the UI or API endpoints without requiring application deployments.

### Native timezone support
A common production pitfall is assuming the server will always run on UTC and that all clients live in the same time zone. Runiq allows you to configure specific target timezones for recurring tasks:

```go
loc, _ := time.LoadLocation("America/New_York")
pool.RegisterCron("0 9 * * 1-5", "default", "DailyReport", []byte(`{}`), queue.WithCronLocation(loc))
```

Under the hood, Runiq converts the current time to the designated timezone (e.g., `America/New_York`) before checking if it matches the cron expression fields (minute, hour, day, month, weekday). This ensures that business tasks run precisely at local business hours, even during daylight saving time (DST) transitions, independent of the host machine's timezone.

---
## Technical terms demystified

*   **Truncate:** The operation of discarding smaller time units from a timestamp. For example, truncating `17:45:32` to minute precision yields `17:45:00`.
*   **Timezone Location:** A geographical zone identifier (like `America/New_York` or `Europe/London`) that maps daylight saving time shifts and historical timezone changes, as opposed to a fixed numeric offset like `UTC-5`.
*   **ACID Guarantees:** A set of database properties (Atomicity, Consistency, Isolation, Durability) ensuring transactions are processed reliably, even in concurrent or failure states.
