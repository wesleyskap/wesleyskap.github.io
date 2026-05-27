---
title: "Resilience in Ruby Microservices: Exponential Backoff, DLQ, and Thread-Safe Circuit Breaker"
excerpt: "Distributed systems fail. Learn how to design retry policies, Dead Letter Queue (DLQ) routing, and outbound circuit breakers in SharedBroker."
category: "Resilience"
date: "May 26, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## Fault Tolerance in Distributed Systems

In a distributed architecture, temporary failures of integrated microservices are a certainty: database spikes, network latency, and timeouts. If a consumer crashes immediately upon encountering a transient glitch, vital business transactions will be lost.

To guarantee that no message is lost, the **SharedBroker** gem incorporates built-in resilience strategies: **Exponential Backoff Retries**, **DLQ (Dead-Letter Queue) routing** enriched with error metadata, and a thread-safe **Circuit Breaker** for outbound calls.

## Exponential Backoff Retries and DLQ Routing

When message processing fails, the consumer retries execution. The duration of the intervals between retries increases exponentially (e.g., $2^n$ seconds) to give the downstream service time to recover.

If the retry limit is exhausted, the message is automatically routed to a **Dead-Letter Queue (DLQ)** with failure metadata for auditing:

```ruby
module SharedBroker
  class RetryRunner
    def initialize(max_retries: 3, backoff_base: 2)
      @max_retries = max_retries
      @backoff_base = backoff_base
    end

    def execute(message, dlq_handler)
      attempts = 0
      begin
        attempts += 1
        yield message
      rescue => e
        if attempts <= @max_retries
          # Calculates backoff delay: base ^ attempts
          delay = @backoff_base ** attempts
          sleep(delay)
          retry
        else
          # Routes to DLQ with detailed error logs
          error_metadata = {
            failed_at: Time.now.to_s,
            exception_class: e.class.name,
            exception_message: e.message
          }
          dlq_handler.call(message, error_metadata)
        end
      end
    end
  end
end
```

## Thread-Safe Outbound Circuit Breaker

The `CircuitBreaker` protects both the publisher and the broker. If the broker (e.g., RabbitMQ) is down and publications begin timing out, the circuit transitions to **OPEN**.

While open, new publish requests fail immediately (Fast-Fail), preventing local Rails process threads from blocking.

```ruby
module SharedBroker
  class CircuitBreaker
    attr_reader :state

    def initialize(failure_threshold: 5, cooldown: 30)
      @failure_threshold = failure_threshold
      @cooldown = cooldown
      @failures = 0
      @state = :closed
      @last_failure_time = nil
      @mu = Mutex.new # Thread-safe synchronization
    end

    def execute
      @mu.synchronize do
        check_cooldown
        raise "Circuit is OPEN - failing fast" if @state == :open
      end

      begin
        yield
        reset_failures
      rescue => e
        record_failure
        raise e
      end
    end

    private

    def record_failure
      @mu.synchronize do
        @failures += 1
        if @failures >= @failure_threshold
          @state = :open
          @last_failure_time = Time.now
        end
      end
    end

    def reset_failures
      @mu.synchronize do
        @failures = 0
        @state = :closed
      end
    end

    def check_cooldown
      if @state == :open && Time.now - @last_failure_time > @cooldown
        @state = :half_open
      end
    end
  end
end
```

### Technical Terms Demystified
- **Dead-Letter Queue (DLQ):** A secondary queue dedicated to storing failed messages for human or system inspection.
- **Fast-Fail:** A resilience practice that rejects operations bound to fail immediately, preserving system resources.
- **Mutex (Mutual Exclusion):** A lock used in concurrent programming to prevent multiple threads from accessing shared variables simultaneously.
---
