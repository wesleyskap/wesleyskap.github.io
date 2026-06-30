---
title: "Runiq genesis:Designing a standalone background job engine in Go"
excerpt: "Why build a task processor from scratch when we have RabbitMQ or Kafka? Explore the design decisions, zero-coupling architecture, and core abstractions of Orkai Runiq."
category: "Mensageria"
date: "June 26, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## The infrastructure dilemma:Message brokers vs. job processors

When we need to process heavy asynchronous tasks (such as sending emails, generating reports, or managing state transitions), the engineering team's first instinct is often to reach for well-known industry options: **RabbitMQ**, **Apache Kafka**, or **AWS SQS**.

However, there is a subtle but critical distinction between **Message Brokers** (message transport systems) and **Job Processors** (task execution engines):

*   **Message Brokers (RabbitMQ/Kafka):** Focus on raw routing, throughput, and fast byte delivery. They are agnostic to the lifecycle of the task described by the message. If a message processing fails, the broker has no native intelligence for exponential backoff, conditional retrying, or displaying the execution stack trace on an admin panel without heavy custom engineering (such as combining DLX with TTL on RabbitMQ).
*   **Job Processors (Runiq, Sidekiq, Celery):** Are designed around the concept of a **task**. They natively understand max attempts, execution states (Pending, Active, Processed, Dead), future scheduling, and dependency graphs.

**Orkai Runiq** was born to bridge this gap in the Go ecosystem as a **standalone** solution. It allows developers to leverage the power of a resilient task orchestrator without the operational overhead of running Erlang clusters (RabbitMQ) or heavy JVM setups with ZooKeeper (Kafka). Runiq only requires a storage provider that is likely already in your stack: PostgreSQL, Redis, or an embedded SQLite instance.

---
## Zero coupling and interface-driven flexibility

One of Runiq's primary design pillars is **loose coupling**. Instead of forcing the application to use a specific database, all persistence operations are abstracted behind clean, small Go interfaces.

The central abstraction is the `JobQueue` interface defined in `queue/queue.go`:

```go
type JobQueue interface {
	// Enqueue persists the job envelope in the storage backend
	Enqueue(ctx context.Context, env *JobEnvelope) error

	// Dequeue fetches the next pending task matching worker tags
	Dequeue(ctx context.Context, queue string, workerTags []string) (*JobEnvelope, error)

	// Ack marks the task as successfully completed
	Ack(ctx context.Context, jobID string) error

	// Fail registers a task execution failure for retries or DLQ
	Fail(ctx context.Context, jobID string, err error) error
}
```

Any database or key-value store implementing these signatures can serve as a storage backend. Under the hood, we extend these capabilities using interface composition, such as `ScheduledJobQueue` (for deferred jobs), `BatchStorage` (for batch processing), and `WorkflowStorage` (for DAG dependency graphs).

---
## The job envelope and dynamic context propagation

For a job to be persisted and later executed by a distributed worker, it must be wrapped. The `JobEnvelope` carries not only the serialized task arguments but also operational and telemetry metadata.

An interesting performance detail is the physical field order within the Go struct. Larger fields (such as slices and nested structures) are declared at the top, while smaller numeric fields are at the bottom. This prevents memory waste from structure alignment padding (*struct padding*):

```go
type JobEnvelope struct {
	TraceContext TraceContext  `json:"trace_context"` // Distributed tracing
	Args         []byte        `json:"args"`          // JSON serialized payload
	Dependencies []string      `json:"dependencies,omitempty"`
	Tags         []string      `json:"tags,omitempty"`
	JobID        string        `json:"job_id"`
	Queue        string        `json:"queue"`
	Name         string        `json:"name"`
	UniqueKey    string        `json:"unique_key,omitempty"`
	BatchID      string        `json:"batch_id,omitempty"`
	RunAt        *time.Time    `json:"run_at,omitempty"`
	UniqueTTL    time.Duration `json:"unique_ttl,omitempty"`
	Priority     int           `json:"priority"`
	Attempts     int           `json:"attempts"`
	MaxAttempts  int           `json:"max_attempts"`
}
```

The presence of `TraceContext` is essential. It allows distributed tracing metadata from `orkai-observability` (such as `TraceID` and `SpanID`) to be injected when the client enqueues a job, and extracted when a worker on another node begins execution. This keeps the execution trace unified and readable across distributed environments.

---
## Getting started:A clean and fluid API

Running worker pools in Go with Runiq is extremely straightforward. The default client implementation provides fluid helpers like `EnqueueIn` and `EnqueueUnique` to simplify developer ergonomics:

```go
// 1. Define the Job implementing the Perform interface
type SendEmailJob struct{}

func (s *SendEmailJob) Perform(ctx context.Context, args []byte) error {
	// Your email sending logic goes here...
	return nil
}

func main() {
	// 2. Initialize Storage (e.g. Postgres)
	storage, _ := queue.NewPostgresStorage(db)

	// 3. Configure the Worker Pool with concurrency = 5
	pool := queue.NewWorkerPool(storage, 5)
	pool.Register("SendEmail", &SendEmailJob{})

	// Start the worker pool in the background
	go pool.Start(context.Background(), "emails")

	// 4. Enqueue a job using the Client
	client := queue.NewClient(storage)
	client.Enqueue(context.Background(), "emails", "SendEmail", []byte(`{"to":"user@example.com"}`))
}
```

This simple API hides the complex inner workings of Runiq, which natively handles panic recovery, concurrency limits, retries, and trace propagation without adding noise to your business logic.

---
## Technical terms demystified

*   **Standalone:** An application that runs as an independent binary and does not require external coordinator services other than its primary database/datastore.
*   **Struct Padding:** The memory alignment practice of compilers. Go aligns structure fields in multiples of bytes matching the processor word size. Organizing fields from largest to smallest saves memory space.
*   **Boilerplate:** Repetitive setup code that does not implement any direct business rules but is required to bootstrap components.
