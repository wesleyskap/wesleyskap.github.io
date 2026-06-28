---
title: "Resilient Concurrency: FOR UPDATE SKIP LOCKED in Postgres and SQLite WAL in Runiq"
excerpt: "How do you ensure multiple distributed workers do not consume the same task without causing locking bottlenecks? Explore SKIP LOCKED and the secret of concurrent SQLite in Go."
category: "Performance & Concorrência"
date: "June 28, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---

## The Concurrency Challenge: The Worker Goroutine Race

In distributed systems, multiple workers running in parallel across different servers or goroutines try to fetch the next pending task from the queue at the same time. If two workers fetch the exact same job simultaneously, it triggers a catastrophic double-execution scenario.

To prevent this, traditional message brokers implement complex lock management or use dedicated memory-level locks. Since **Orkai Runiq** is standalone and relies on relational databases for persistence, the responsibility of ensuring mutual exclusion falls directly on the database engine.

However, doing this naively using table-level locks (`LOCK TABLE`) completely destroys queue performance. The secret lies in locking only the specific row that is being fetched, in complete isolation.

---

## PostgreSQL: FOR UPDATE SKIP LOCKED

In the PostgreSQL driver (`queue/postgres.go`), Runiq solves concurrency using the **`SKIP LOCKED`** feature. The dequeue operation is executed inside an atomic, database-level transaction:

```go
func (p *PostgresStorage) Dequeue(ctx context.Context, queueName string, workerTags []string) (*JobEnvelope, error) {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	
	// Fetch the next pending tasks ordered by priority
	env, err := p.dequeueTx(ctx, tx, queueName, workerTags)
	if err != nil || env == nil {
		return env, err
	}
	
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return env, nil
}
```

During this transaction, we execute an update statement that shifts the job state to `'running'` using an atomic sub-select with `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE runiq_jobs SET status = 'running', locked_at = CURRENT_TIMESTAMP
WHERE job_id = (
	SELECT job_id FROM runiq_jobs
	WHERE job_id = $1 AND status = 'pending' FOR UPDATE SKIP LOCKED
)
RETURNING job_id, queue, name, args, trace_id, span_id, attempts, max_attempts, unique_key, batch_id, priority, tags
```

### What happens under the hood?
1. **`FOR UPDATE`:** Acquires an exclusive write lock on the selected row, preventing other concurrent transactions from modifying or locking it.
2. **`SKIP LOCKED`:** If another concurrent worker transaction has already locked this specific row (`jobID`), the current query **silently ignores** the locked row and proceeds to evaluate the next one in line.

This mechanism eliminates queue bottlenecks and **lock contention**. Workers never block waiting for another to finish; they simply skip already claimed jobs.

---

## SQLite: Lock-Free Optimization with WAL Mode and Busy Timeouts

SQLite is frequently dismissed for concurrent write workloads due to its classic `database is locked` error. However, with the right engineering configurations, SQLite can be used as an incredibly fast and lightweight background queue engine.

In Runiq's SQLite driver (`queue/sqlite.go`), we apply two crucial database configurations (`PRAGMA`) right when the connection is initialized:

```go
func NewSqliteStorage(db *sql.DB) (*SqliteStorage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Enable Write-Ahead Logging (WAL) mode
	_, _ = db.ExecContext(ctx, "PRAGMA journal_mode=WAL;")

	// 2. Define the busy timeout duration
	_, _ = db.ExecContext(ctx, "PRAGMA busy_timeout=5000;")
	
	// ...
}
```

### Why WAL Mode is a Game Changer
In traditional journal modes (such as *Rollback Journal*), SQLite locks the entire database file for any read operations while a write transaction is executing.

With **WAL (Write-Ahead Logging)** enabled:
1. **Readers and Writers do not block each other:** Multiple read queries can run concurrently while a background process writes to the database. Write modifications are appended to a separate `.wal` file very quickly.
2. **Busy Timeout:** If a temporary write conflict occurs, the database connection waits up to 5 seconds (`5000ms`) for the lock to release before throwing an error, allowing concurrent transactions to commit smoothly.

In the `dequeueTx` method, Runiq fetches up to 100 pending jobs, evaluates tag matching in-memory, updates the matched job's status to `'running'`, and commits the transaction immediately to keep the write window as short as possible:

```go
func (s *SqliteStorage) dequeueTx(ctx context.Context, tx *sql.Tx, queueName string, workerTags []string) (*JobEnvelope, error) {
	query := `
		SELECT job_id, queue, name, args, trace_id, span_id, attempts, max_attempts, unique_key, batch_id, priority, tags
		FROM runiq_jobs
		WHERE queue = ? AND status = 'pending' AND (run_at IS NULL OR strftime('%s', run_at) <= strftime('%s', 'now'))
		ORDER BY priority DESC, created_at ASC LIMIT 100`
	
	rows, err := tx.QueryContext(ctx, s.q(query), queueName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	selected, err := findMatchingJob(rows, workerTags)
	if err != nil || selected == nil {
		return selected, err
	}

	upd := "UPDATE runiq_jobs SET status = 'running', locked_at = CURRENT_TIMESTAMP WHERE job_id = ?"
	_, err = tx.ExecContext(ctx, s.q(upd), selected.JobID)
	return selected, err
}
```

---

## Technical Terms Demystified

*   **Lock Contention:** A performance bottleneck that occurs when multiple threads or processes try to acquire the same lock simultaneously, causing other threads to block and wait.
*   **Write-Ahead Logging (WAL):** A data writing technique where changes are appended to a separate, sequential log file before they are applied to the main database file. This allows reads and writes to happen concurrently.
*   **PRAGMA (SQLite):** SQL extensions specific to SQLite used to query or modify internal configurations and performance parameters of the database engine.
