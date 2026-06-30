---
title: "Concurrency control, adaptive backpressure, and hybrid multi-adapter routing"
excerpt: "How do you avoid overloading local databases and route events to multiple brokers in Ruby microservices? Learn about concurrency and routing."
category: "Performance"
date: "June 03, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## Resource saturation in asynchronous ingestion loops

A fast message consumer can easily overwhelm a microservice. If a message broker delivers thousands of backlogged events without bounds, background threads in Rails will attempt to process them concurrently. Within seconds, this parallel activity exhausts the local database pool (`ActiveRecord::ConnectionTimeoutError`), taking down the main API.

To prevent resource exhaustion, consumers require two architectural controls: **Concurrency Limits** and **Adaptive Backpressure**. Furthermore, complex enterprise setups need the flexibility of **Hybrid Multi-Adapter Routing** to direct topics to different brokers.

## Controlling concurrency and backpressure

The **SharedBroker** gem implements a pure-Ruby thread-safe semaphore to limit concurrent task executions. 

Simultaneously, it exposes a health hook (**Backpressure Check**). If this validation returns `true` (e.g., indicating high local database latency or CPU load), the consumer pauses pulling new messages, giving the application time to drain the active work backlog:

```ruby
module SharedBroker
  module Concurrency
    class Limiter
      def initialize(max_concurrency: 5, backpressure_check: nil, backpressure_backoff: 2.0)
        @max_concurrency = max_concurrency
        @backpressure_check = backpressure_check
        @backpressure_backoff = backpressure_backoff
        @semaphore = Thread::Queue.new # Pure Ruby concurrent queue as a semaphore
        @max_concurrency.times { @semaphore.push(:token) }
      end

      def execute
        # 1. Evaluates system health (Backpressure)
        if @backpressure_check&.call
          sleep(@backpressure_backoff)
          return false
        end

        # 2. Acquires semaphore token
        token = @semaphore.pop
        Thread.new do
          begin
            yield
          ensure
            # Restores the token to allow future execution
            @semaphore.push(token)
          end
        end
        true
      end
    end
  end
end
```

## Hybrid topic routing (multi-adapter routing)

Legacy and modern services often co-exist with different message brokers. The gem allows routing events to specific physical adapters using wildcard string matching (Globs):

```ruby
# Routing map configuration
routing_table = {
  "payment.processed" => :rabbitmq,
  "telemetry.*"       => :kafka,
  "cache.*"           => :redis,
  "*"                 => :rabbitmq # default fallback
}

# Dynamically selects the adapter based on pattern matching
def select_adapter(topic, routing_table, adapters)
  match = routing_table.keys.find { |pattern| File.fnmatch?(pattern, topic) }
  adapter_key = routing_table[match] || :rabbitmq
  adapters[adapter_key]
end
```

With this architecture, the gem handles the network complexity of multiple brokers behind a unified, simple client interface.

### Technical terms demystified
- **Backpressure:** A resource preservation technique where a consumer signals the broker to slow down or pause message delivery to prevent overload.
- **Semaphore:** A concurrent synchronization primitive limiting access to shared resources to a set maximum number of threads.
- **Glob Pattern:** A simplified text matching syntax using wildcards (like asterisks `*`) to match string paths.
