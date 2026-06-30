---
title: "Complex workflow orchestration:Relational DAGs and batches in runiq"
excerpt: "How do you run task graphs with dependencies or parallel batches using raw SQL and transactional guarantees? Explore Runiq's internal DAG and Batch architecture."
category: "Sistemas Distribuídos"
date: "June 24, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Beyond simple queues:The need for workflows

Running workers that pull tasks from a linear queue covers about 80% of basic use cases. However, as applications grow, business rules call for more complex execution topologies:

1.  **Deduplication (Unique Jobs):** Preventing a "SyncAccount" task from enqueuing if an identical task is already waiting to be processed.
2.  **Batches (MapReduce Processing):** Spawning 100 image-processing jobs in parallel and, only when all of them complete, executing a callback task to "SendSuccessNotification".
3.  **DAGs (Directed Acyclic Graphs / Workflows):** Defining that Job C can only run after Job A and Job B have completed successfully. If Job A fails permanently, Job C must be automatically cancelled (cascading failure).

In **Orkai Runiq**, these enterprise-level orchestration features are implemented natively at the storage layer using transaction-safe relational SQL blocks, eliminating the need for dedicated, resource-heavy workflow engines like Temporal.

---
## How relational DAGs work under the hood

The core of Runiq's dependency engine is structured directly over relational schema tables (`queue/postgres_workflow.go` and `queue/sqlite_workflow.go`).

When you enqueue a dependent workflow (using `DependsOn` and `EnqueueWorkflow`), Runiq processes the task graph using these steps:

### 1. initial blocked state
If a child job has unresolved parent dependencies, it is written to the database with a `"blocked"` status instead of `"pending"`. This prevents workers from fetching it prematurely. The dependency links are persisted in the `runiq_job_dependencies (job_id, parent_job_id)` join table.

### 2. dynamic resolution (success flow)
When a worker finishes executing a task successfully, Runiq calls `resolveDependencies` inside the confirmation transaction (`Ack`):

```go
func (p *PostgresStorage) resolveDependencies(ctx context.Context, tx *sql.Tx, parentJobID string) error {
	// 1. Fetch child IDs depending on this parent
	childIDs, err := p.queryChildJobIDs(ctx, tx, parentJobID)
	if err != nil {
		return err
	}
	
	// 2. Remove this parent dependency record
	if _, err := tx.ExecContext(ctx, p.q("DELETE FROM runiq_job_dependencies WHERE parent_job_id = $1"), parentJobID); err != nil {
		return err
	}
	
	// 3. Check if children have other pending parents
	return p.checkBlockedChildren(ctx, tx, childIDs)
}
```

In the `checkBlockedChildren` method, Runiq queries if any child jobs still have remaining parent references. If the count is zero (`count == 0`), it means all parent jobs completed successfully. Runiq then transitions the child job's status from `"blocked"` to `"pending"` within the same transaction, making it immediately available for consumption.

### 3. cascading failure propagation
If a parent job exhausts all its retries and fails permanently, Runiq triggers a **cascading failure propagation**. Child tasks are automatically moved to the `"dead"` state (DLQ) with the error message `"Dependency <parent_job_id> failed"`, recursively cleaning up the downstream graph.

---
## Batches with native callbacks

Batch processing follows a similar transactional structure. When enqueuing a Batch:

1.  We write a batch tracking row containing the total job count and configure the `callback` (a standard job envelope to be triggered at the end).
2.  Each completed task associated with the batch atomically decrements the batch's active task count in the database.
3.  When the counter hits zero, the transaction confirming the final task automatically enqueues the registered callback job.

```go
// Example of setting up a high-performance Batch:
batchID := "invoice-batch-2026"
callbackJob := &queue.JobEnvelope{
	Queue: "notifications",
	Name:  "NotifyBillingComplete",
	Args:  []byte(`{"batch_id":"invoice-batch-2026"}`),
}

// Initialize the batch record
_ = client.CreateBatch(ctx, batchID, callbackJob, nil)

// Enqueue jobs associated with the batch
for _, invoice := range invoices {
	job := &queue.JobEnvelope{
		Queue: "billing",
		Name:  "ProcessInvoice",
		Args:  invoice.JSON(),
	}
	_ = client.EnqueueInBatch(ctx, batchID, job)
}

// Seal the batch for execution
_ = client.SubmitBatch(ctx, batchID)
```

---
## Technical terms demystified

*   **DAG (Directed Acyclic Graph):** A mathematical graph of nodes (tasks) connected by directed edges (dependencies) without loops. It is used to model execution order.
*   **Callback:** A function or task passed as an argument that runs automatically once an asynchronous operation or set of jobs finishes.
*   **Transactional (All-or-Nothing):** A database transaction property ensuring that a sequence of operations either succeeds completely or has no effect at all (rollback).
