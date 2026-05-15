---
title: "Local vs. Production Viewing: Colored ANSI Formatters and Self-Monitoring Metrics"
excerpt: "Structured JSON logs are perfect for indexers but hard to read in local terminals. Learn how to implement color console logs in Go."
category: "Performance"
date: "May 15, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 14
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## Differing Log Needs: Development vs. Production

In Kubernetes environments, application logs should be structured as raw, single-line JSON objects. This format allows automated scrapers to parse and index log messages efficiently with minimal CPU consumption.

However, viewing raw JSON logs in a local terminal during development is an exhausting experience. Stacked strings make it difficult to identify log severity levels (`INFO`, `WARN`, `ERROR`) at a glance.

To address this, **orkai-observability** includes a colored console formatter utilizing **ANSI Escape Codes** for local development, combined with internal self-monitoring metrics.

## Designing the ANSI Console Formatter

When the application detects a development environment (`Environment == "dev"`), the logger bypasses JSON serialization and formats the logs using ANSI color codes based on severity:

```go
package main

import (
	"fmt"
	"time"
)

const (
	ansiReset  = "\033[0m"
	ansiRed    = "\033[31m"
	ansiYellow = "\033[33m"
	ansiGreen  = "\033[32m"
	ansiCyan   = "\033[36m"
)

// FormatColorConsole formats the log entry into a human-readable, colored string
func FormatColorConsole(level, msg string, fields map[string]string) string {
	timestamp := time.Now().Format("15:04:05.000")
	var color string

	switch level {
	case "INFO":
		color = ansiGreen
	case "WARN":
		color = ansiYellow
	case "ERROR":
		color = ansiRed
	default:
		color = ansiCyan
	}

	fieldsStr := ""
	for k, v := range fields {
		fieldsStr += fmt.Sprintf(" %s%s%s=%s", ansiCyan, k, ansiReset, v)
	}

	return fmt.Sprintf("%s %s[%-5s]%s %s%s\n", 
		timestamp, color, level, ansiReset, msg, fieldsStr,
	)
}
```

## Logging Engine Self-Monitoring

Beyond styling the terminal output, the logging engine monitors its own system health. It exposes internal counters crucial for identifying queue saturation in production:
- **`observability_dropped_logs_total`:** Tracks log messages discarded due to strict rate-limiting policies.
- **`observability_async_buffer_saturation_ratio`:** Measures the utilization ratio of the background channel.

### Technical Terms Demystified
- **ANSI Escape Codes:** A standard terminal protocol using character sequences to control font formatting, colors, and cursor position.
- **Self-Monitoring:** A design pattern where a software component exposes metrics about its own memory usage, error rates, and throughput.
- **Throttling:** The intentional restriction of an execution rate to protect a service from resource exhaustion.
---
