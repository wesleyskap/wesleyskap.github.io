---
title: "HTTP payload logging:Implementing smart sampling to prevent storage saturation"
excerpt: "Logging entire HTTP request and response payloads consumes massive storage and hurts performance. Learn how to apply payload sampling in Go."
category: "Performance"
date: "May 13, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 13
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## Balancing visibility and performance

In microservice architectures, logging raw HTTP request and response payloads is valuable for debugging invalid inputs or downstream integration bugs. However, writing every single JSON payload to disk introduces two major issues:
1. **High Storage Cost:** Large payloads or binary files quickly saturate log aggregators (like Elasticsearch or Loki), escalating server infrastructure costs.
2. **CPU and Latency Overhead:** Reading and converting byte arrays from connections consumes CPU cycles and increases request response times.

To strike the right balance, the **orkai-observability** package implements **Smart Payload Sampling**.

## Designing the sampling middleware

The middleware processes HTTP payloads based on a configurable sampling rate (e.g., logging only 10% of payloads for successful requests). However, to guarantee debugging visibility, any failed server response (`status >= 500`) is forced to log its payload:

```go
package main

import (
	"bytes"
	"io"
	"math/rand"
	"net/http"
)

type SamplingConfig struct {
	SampleRate float64 // Values between 0.0 (0%) and 1.0 (100%)
}

type PayloadLogger struct {
	config SamplingConfig
}

func (pl *PayloadLogger) LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Evaluates if the current request is selected for sampling
		shouldSample := rand.Float64() < pl.config.SampleRate

		var bodyBuffer []byte
		if shouldSample {
			// Reads and duplicates the request body, leaving it intact for the handler
			if r.Body != nil {
				bodyBuffer, _ = io.ReadAll(r.Body)
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBuffer))
			}
		}

		// Wraps the ResponseWriter to intercept the outgoing body
		rec := &responseRecorder{ResponseWriter: w, body: bytes.NewBuffer(nil)}
		
		next.ServeHTTP(rec, r)

		isError := rec.statusCode >= 500
		if shouldSample || isError {
			// Records the payloads inside structured logs
			pl.writePayloadLog(r.URL.Path, bodyBuffer, rec.body.Bytes(), rec.statusCode)
		}
	})
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

func (rec *responseRecorder) Write(b []byte) (int, error) {
	rec.body.Write(b)
	return rec.ResponseWriter.Write(b)
}

func (pl *PayloadLogger) writePayloadLog(path string, req, resp []byte, status int) {
	// Logger output logic
}
```

### Technical terms demystified
- **Payload:** The core data transmitted in a network transaction, such as the JSON body in a request or response.
- **Sampling:** The technique of collecting a representative subset of events to save storage and processing resources.
- **NopCloser:** A Go utility wrapping a basic reader to satisfy the `io.ReadCloser` interface without adding custom Close behavior.
