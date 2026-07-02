---
title: "Job priority, worker affinity, and hardware tags:Orchestrating intelligent execution in runiq"
excerpt: "How do you ensure critical jobs are processed first and that GPU-intensive or memory-heavy tasks land on the right worker? Learn about Runiq's priority and affinity system."
category: "Sistemas Distribuídos"
date: "July 1, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## The fair ordering dilemma in background queues

In traditional queue systems, all jobs compete equally. A welcome email might jump ahead of an urgent subscription cancellation, and a GPU-intensive image processing job could land on a generic worker without hardware acceleration, failing miserably.

To solve both problems without adding external routing complexity, Orkai Runiq implements two complementary mechanisms: **numeric job priority** and **worker affinity via tags**.

---

## Numeric priority:Critical jobs jump the line

Every job in Runiq carries an integer `priority` field in its envelope. Higher values are dequeued first. The ordering happens natively in the dequeue SQL:

```go
func (env *JobEnvelope) WithPriority(priority int) *JobEnvelope {
	env.Priority = priority
	return env
}
```

```sql
-- PostgreSQL: dequeue prioritizes by priority DESC
SELECT job_id, queue, name, args, ...
FROM runiq_jobs
WHERE queue = $1 AND status = 'pending'
  AND (run_at IS NULL OR run_at <= CURRENT_TIMESTAMP)
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

### Usage scenarios
1. **Critical jobs (priority 100):** Billing, account cancellation, refunds.
2. **Normal jobs (priority 0):** Notification emails, cache sync.
3. **Maintenance jobs (priority -10):** Data cleanup, report generation.

The client exposes a fluent API for configuring priority at enqueue time:

```go
job := queue.NewJob("default", "ProcessPayment", payload).
	WithPriority(100)

client.EnqueueJob(ctx, job)
```

---

## Hardware tags:Worker-to-job affinity

The second mechanism solves the opposite problem: not every worker can run every job. Workers on GPU-enabled or high-memory machines can self-declare with **capability tags** at startup:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithWorkerTags("gpu", "high-memory"),
)
```

On the job side, the developer specifies which tags are mandatory:

```go
gpuJob := queue.NewJob("ml", "TrainModel", modelPayload).
	RequireTags("gpu")

client.EnqueueJob(ctx, gpuJob)
```

The matching engine runs inside the `Dequeue` method at fetch time. The worker reports its tags, and the storage only returns jobs whose required `tags` are a subset of the worker's tags:

```go
func matchTags(jobTags, workerTags []string) bool {
	if len(jobTags) == 0 {
		return true
	}
	for _, jt := range jobTags {
		found := false
		for _, wt := range workerTags {
			if jt == wt {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
```

### How matching works in the lifecycle
1. The consumer calls `storage.Dequeue(ctx, queueName, workerTags)` with its capability tags.
2. The SQL (or Redis command) filters jobs where `tags` is empty or is a subset of the worker's tags.
3. If no compatible job is found, the worker sleeps 100ms and retries.

This eliminates the need for separate queues per worker type and keeps routing fully declarative.

---

## Combining priority and affinity

The real power emerges when combining both mechanisms. An ML inference job (high priority + `gpu` tag) will be processed before cleanup jobs (low priority) and only by GPU-capable workers:

```go
criticalGPUJob := queue.NewJob("ml", "RealTimeInference", payload).
	WithPriority(200).
	RequireTags("gpu", "low-latency")
```

The result is a queue system that understands both the urgency of a job and the capability of the worker that will execute it, without relying on external routers or Kubernetes ConfigMap.

---

## Technical terms demystified

*   **Worker Affinity:** A mechanism that binds jobs to specific workers based on declared characteristics from both sides, ensuring only compatible workers execute certain tasks.
*   **Priority Inversion:** A phenomenon where a low-priority job indirectly blocks a high-priority one. Runiq avoids this with `priority DESC` ordering at the database level.
*   **Tag Matching:** An algorithm that checks whether all tags required by a job are present in the worker's declared tag set.
