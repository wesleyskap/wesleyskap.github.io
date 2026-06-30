---
title: "OTel protocol integration:Building a native OTLP http/json exporter without external SDKs"
excerpt: "Leverage OpenTelemetry standards without bringing in heavy SDK packages. Learn how to export spans and logs natively in Go."
category: "Metrics & Tracing"
date: "May 16, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 15
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The footprint of official opentelemetry SDKs

The **OpenTelemetry (OTel)** ecosystem has established itself as the industry standard for telemetry data. However, the official Go SDK imports a very large dependency tree. For small microservices, compiling these packages increases the binary size and adds CPU overhead.

Since the **OTLP (OpenTelemetry Protocol)** specification is open and runs over standard network requests, we can bypass complex SDKs and export our spans and logs directly to any collector (such as Jaeger or the OpenTelemetry Collector) using native HTTP/JSON payloads.

## Designing the custom OTLP exporter

The **orkai-observability** package features a background exporter that groups spans in memory and posts them periodically to the OTel Collector endpoint `/v1/traces`:

```go
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type OTLPSpan struct {
	TraceID           string `json:"traceId"`
	SpanID            string `json:"spanId"`
	Name              string `json:"name"`
	StartTimeUnixNano int64  `json:"startTimeUnixNano"`
	EndTimeUnixNano   int64  `json:"endTimeUnixNano"`
}

type OTLPExporter struct {
	collectorURL string
	client       *http.Client
}

func NewOTLPExporter(collectorURL string) *OTLPExporter {
	return &OTLPExporter{
		collectorURL: collectorURL,
		client:       &http.Client{Timeout: 5 * time.Second},
	}
}

// ExportSpans sends a batch of trace records in OTLP format
func (e *OTLPExporter) ExportSpans(ctx context.Context, spans []OTLPSpan) error {
	payload := map[string]any{
		"resourceSpans": []any{
			map[string]any{
				"scopeSpans": []any{
					map[string]any{
						"spans": spans,
					},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", e.collectorURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}
```

## Benefits of the custom exporter

Implementing the OTLP exporter natively:
- Retains compliance and interoperability with the OpenTelemetry standard.
- Results in lightweight compiled binaries, saving container disk space and boot times.
- Allows control over queue buffering and endpoint retry behaviors.

### Technical terms demystified
- **OTLP (OpenTelemetry Protocol):** A specialized protocol designed by the CNCF for sending telemetry data from instrumented applications.
- **OTel Collector:** A high-performance proxy service that receives, filters, and forwards metrics and traces to destination databases.
- **Resource Spans:** The root element of OTLP payloads representing the entity (service name, host) producing the spans.
