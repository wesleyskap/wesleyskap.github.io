---
title: "Real-time alerts:Detecting slow queries and protecting databases from degradation"
excerpt: "Slow database queries cause silent bottlenecks and exhaust connection pools. Learn how to design an automated slow query alert system."
category: "Resilience"
date: "May 05, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 11
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The silent threat of slow queries

In relational databases, poorly structured queries (such as full table scans on large tables due to missing indexes) can take seconds to return. As API traffic grows, these slow queries hold onto physical connections longer. Soon, the database connection pool reaches its limit, blocking new incoming requests and leading to complete service downtime.

Detecting these issues late (typically after production database crashes) is costly. The ideal solution is to configure the application to alert us actively when a query exceeds a healthy limit (**Slow Query Threshold**).

## Implementing slow query alerts

The **orkai-observability** package extends the database wrapper to analyze query duration. If a query runs longer than the configured threshold, the wrapper automatically logs a `WARN` alert:

```go
package main

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type Config struct {
	EnableSlowQueryAlert bool
	SlowQueryThreshold   time.Duration
}

type ResilientDB struct {
	db     *sql.DB
	config Config
}

// ExecuteQuery runs a query and monitors if its duration crosses the slow query threshold
func (rdb *ResilientDB) ExecuteQuery(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	startTime := time.Now()
	rows, err := rdb.db.QueryContext(ctx, query, args...)
	duration := time.Since(startTime)

	// Triggers warning if threshold is exceeded
	if rdb.config.EnableSlowQueryAlert && duration > rdb.config.SlowQueryThreshold {
		log.Printf("[SLOW QUERY WARN] Query took %v to execute (Limit: %v) | Query: %s", 
			duration, rdb.config.SlowQueryThreshold, query,
		)
	}

	return rows, err
}
```

## Benefits of proactive alerting

Implementing this pattern:
- Helps developers locate query bottlenecks before they degrade production servers.
- Monitors database performance fluctuations caused by unexpected table growth.
- Routes structured logs to automatic notification services (like Slack or PagerDuty).

### Technical terms demystified
- **Slow Query:** A database query whose execution time exceeds a predefined acceptable limit.
- **Threshold:** The configured limit used as a rule to trigger alerts or transition states.
- **Connection Pool:** A collection of pre-established database connections reused for concurrent operations, avoiding the cost of opening connections repeatedly.
