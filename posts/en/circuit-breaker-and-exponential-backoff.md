---
title: "Large scale resilience:Building a dependency free circuit breaker and exponential backoff retries in Go"
excerpt: "Distributed systems fail. Uncontrolled requests to unstable APIs trigger a thundering herd. Learn how to engineer a pure state-machine circuit breaker and an exponential backoff retry engine in Go."
category: "Resilience"
date: "Mar 04, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## The circuit breaker state machine

When a third-party API or downstream service fails, executing uncontrolled retries is dangerous. It triggers a phenomenon known as "retry storms", overwhelming the unhealthy dependency and amplifying the outage.

To prevent cascading failures, Orkai incorporates a robust circuit breaker built completely from scratch without external libraries. It monitors request results and transitions dynamically among three states:
- **CLOSED:** Normal operations. Calls flow freely. If the error threshold is reached, the breaker trips.
- **OPEN:** The circuit detected that the downstream service is unhealthy. Outbound requests are blocked in memory instantly with a fast-fail error, avoiding network transmission to protect the infra.
- **HALF-OPEN:** After a configured cooldown period, the circuit allows a limited number of trial requests. If any fail, it trips back to `OPEN`. If all pass, it restores the `CLOSED` state.

To ensure absolute thread safety under heavy concurrent access, we protect all state changes and metrics counters using mutual exclusion locks (`sync.Mutex`).

[DIAGRAM_CIRCUIT_BREAKER]

```go
type CircuitBreakerState int
const (
	StateClosed CircuitBreakerState = iota
	StateOpen
	StateHalfOpen
)

type CircuitBreaker struct {
	mu           sync.Mutex
	state        CircuitBreakerState
	failures     int
	successes    int
	threshold    int
	openTime     time.Time
	cooldown     time.Duration
}

func (cb *CircuitBreaker) Execute(operation func() error) error {
	cb.mu.Lock()
	if cb.state == StateOpen {
		if time.Since(cb.openTime) > cb.cooldown {
			cb.state = StateHalfOpen // Cooldown expired, transition to test mode
		} else {
			cb.mu.Unlock()
			return fmt.Errorf("circuit breaker is OPEN") // Fast-Fail in memory
		}
	}
	cb.mu.Unlock()

	err := operation()

	cb.mu.Lock()
	defer cb.mu.Unlock()
	if err != nil {
		cb.recordFailure()
		return err
	}
	cb.recordSuccess()
	return nil
}
```

## Exponential backoff with progressive backoff

For short-lived network glitches, immediate retries are highly ineffective. The **Exponential backoff** algorithm solves this by progressively increasing the delay duration between consecutive retries geometrically: $delay = base \times 2^{attempt}$.

For example, the first retry waits 100ms, the second 200ms, the third 400ms, giving the downstream server or network path breathing room to recover.

```go
func ExecuteWithRetry(maxRetries int, baseDelay time.Duration, op func() error) error {
	var err error
	for attempt := 0; attempt < maxRetries; attempt++ {
		err = op()
		if err == nil {
			return nil // Operation completed successfully
		}
		// Progressive exponential delay calculation: base * 2^attempt
		delay := baseDelay * time.Duration(math.Pow(2, float64(attempt)))
		time.Sleep(delay) // Block execution for the calculated interval
	}
	return err
}
```

### Technical terms explained
- **Cascading Failure:** A domino effect where a failure in one local component saturates common resources (like database connections or CPU threads), propagating errors throughout the entire architecture.
- **Fast-Fail:** A design pattern that rejects operations immediately when it knows a target dependency is unreachable, avoiding resources being held up in waiting states.
- **Exponential Backoff:** A mathematical progressive backoff algorithm used to back off and delay retry attempts sequentially, giving target services time to recover.
