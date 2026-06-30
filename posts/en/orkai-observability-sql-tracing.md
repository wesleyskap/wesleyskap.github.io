---
title: "Database visibility:Building a tracesql context wrapper to measure query latencies"
excerpt: "Database queries are often the primary source of API latency. Learn how to automate SQL query tracing natively in Go."
category: "Metrics & Tracing"
date: "Apr 30, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 9
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The database black box

When an API's response times degrade, developers typically inspect the route's logical code first. However, in most real-world scenarios, the bottleneck lies in the data access layer: missing indexes, inefficient queries (such as N+1 issues), or transaction lock contentions.

Without appropriate telemetry wrapped around database queries, they remain a black box. The **orkai-observability** package introduces the `TraceSQL` context wrapper to measure and log the execution time of database queries.

## Implementing the tracesql wrapper

`TraceSQL` acts as a contextual wrapper. It starts a new trace span associated with the connection, records the query duration, and attaches the query string to the span attributes:

```go
package main

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type InstrumentedDB struct {
	db *sql.DB
}

// TraceSQL executes a query while measuring and logging its actual duration
func (idb *InstrumentedDB) TraceSQL(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	startTime := time.Now()
	
	// Executes the database query
	rows, err := idb.db.QueryContext(ctx, query, args...)
	
	duration := time.Since(startTime)
	
	// Logs the query metrics
	log.Printf("[SQL] query: %s | duration: %v | error: %v", query, duration, err)
	
	return rows, err
}
```

## Extracting key metrics

With this wrapper:
- We quickly identify which queries or tables produce the highest latencies.
- We capture specific database errors (such as unique constraint violations or query timeouts).
- We route duration statistics to local histograms and external OpenTelemetry endpoints automatically.

### Technical terms demystified
- **Query Wrapper:** A structural pattern wrapping database calls to inject logging and telemetry logic transparently.
- **N+1 Query Problem:** An ORM anti-pattern where a main query triggers N additional individual database calls, degrading performance.
- **Instrumentation:** The process of embedding telemetry code in a system to monitor its execution behavior.
