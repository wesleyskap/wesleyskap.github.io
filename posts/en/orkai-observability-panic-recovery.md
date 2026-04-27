---
title: "HTTP Resilience: Designing a Panic Recovery Middleware to Capture Crashes"
excerpt: "Unexpected runtime failures shouldn't take down your web server. Learn how to intercept panics and return structured JSON errors in Go."
category: "Resilience"
date: "Apr 26, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## The Threat of Runtime Crashes in Production

In Go, if a goroutine attempts to access an out-of-bounds slice index, dereferences a nil pointer, or performs any invalid runtime operation, the runtime triggers a **Panic**. If this panic is not captured explicitly, the entire web server process will crash instantly, disconnecting all active users.

To build high-availability APIs, we must intercept panics occurring inside individual HTTP request lifecycles, log the detailed stack trace for debugging, and return a clean `500 Internal Server Error` response without interrupting the global server process.

## Implementing the Panic Recovery Middleware

Go provides a built-in `recover()` function to capture active panics. We hook into this mechanism using a deferred function call inside a custom HTTP middleware:

```go
package main

import (
	"log"
	"net/http"
	"runtime/debug"
)

// PanicRecoveryMiddleware catches panics and returns a structured JSON 500 error
func PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Captures and prints the call stack trace
				stack := debug.Stack()
				log.Printf("[Recover] Intercepted panic! Error: %v\nStack Trace:\n%s", err, stack)

				// Returns a clean JSON error response
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error": "Internal Server Error", "msg": "An unexpected error occurred."}`))
			}
		}()
		
		// Passes control to the next handler in the HTTP chain
		next.ServeHTTP(w, r)
	})
}
```

## The Value of Collecting Stack Traces

Logging only the panic message (e.g., `nil pointer`) makes troubleshooting difficult. Using `debug.Stack()` captures the exact function calls and file lines where the failure happened, allowing developers to identify and fix the underlying bug in seconds.

### Technical Terms Demystified
- **Panic:** A severe runtime error state in Go that halts the normal execution of the current goroutine.
- **Recover:** A built-in Go function that regains control of a panicking goroutine, halting the shutdown sequence.
- **Defer:** A keyword that schedules a function call to run exactly when the surrounding function returns.
---
