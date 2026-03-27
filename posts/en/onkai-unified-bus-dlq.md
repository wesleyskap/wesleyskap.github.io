---
title: "Error State Machines: Designing Dead-Letter Queues (DLQ) and Jittered Retries"
excerpt: "Distributed systems fail in unpredictable ways. Learn how onkai-unified-bus implements safe exponential backoff retries and poison pill isolation."
category: "Messaging"
date: "Mar 27, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## Transient vs. Permanent Errors

When a consumer fails to process an event, the worst action is retrying it immediately and infinitely. If the error is transient (e.g., temporary network blip), rapid retries will overwhelm the failing downstream service. If the error is permanent (e.g., corrupted payload or schema validation failure), repeating the operation wastes CPU cycles and stalls progress.

To handle this gracefully, **onkai-unified-bus** implements a robust error state machine combining **Exponential Backoff with Jitter** retries and a **Dead-Letter Queue (DLQ)**.

## Exponential Backoff with Jitter

To prevent dozens of disconnected consumers from retrying or reconnecting at the exact same millisecond (the "thundering herd" effect), we inject random delay variance (Jitter) combined with an exponentially increasing interval between retries.

```go
func CalculateBackoff(attempt int, baseDelay, maxDelay time.Duration) time.Duration {
	// Exponential calculation: base * 2^attempt
	backoff := float64(baseDelay) * math.Pow(2, float64(attempt))
	duration := time.Duration(backoff)
	if duration > maxDelay {
		duration = maxDelay
	}
	// Add +/- 10% Jitter (random noise) to spread out retry load
	jitter := rand.Float64() * 0.2 - 0.1
	duration = time.Duration(float64(duration) * (1.0 + jitter))
	return duration
}
```

## Isolation via Dead-Letter Queue (DLQ)

If an event fails after reaching the maximum number of retry attempts (e.g., 5 attempts), it is classified as a permanent logical failure. To prevent stalling the rest of the queue, the event bus intercepts the offending message, attaches the error's stack trace to the message headers, and forwards it to a designated isolation queue called the **Dead-Letter Queue (DLQ)**.

From the DLQ, faulty messages can be audited manually or processed through administrative tools once the underlying business logic bug is fixed.

### Technical Terms Demystified
- **Dead-Letter Queue (DLQ):** A secondary queue dedicated to holding messages that couldn't be delivered or processed successfully by consumers.
- **Thundering Herd Effect:** A situation where many concurrent processes wake up at the same time to handle a single event, overwhelming system resources.
- **Jitter:** The deliberate introduction of small, random time variations to prevent processes from synchronizing their retries.
