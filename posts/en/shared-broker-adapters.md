---
title: "Decoupling messaging in Ruby:Implementing the adapter pattern with inmemory, RabbitMQ, Kafka, and Redis"
excerpt: "How do you decouple message publishing and subscription from the physical broker in Ruby? Learn how to design and use multiple adapters."
category: "Messaging"
date: "May 25, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## The threat of coupling to physical brokers

When building event-driven microservices in Rails or Ruby, developers frequently instantiate connections to message queues (such as RabbitMQ's `bunny` or the `kafka` gem) directly inside application services or controllers.

This creates two immediate architectural bottlenecks:
1. **Slow and Dependent Test Suites:** To run local unit tests, developers are forced to boot physical brokers via Docker, or mock complex network interactions with extensive stubs (`WebMock`/`allow()`).
2. **Difficult Infrastructure Swaps:** Migrating from a simple Redis Pub/Sub model to a high-throughput broker like Kafka requires refactoring multiple locations inside the core business domain.

The **SharedBroker** gem resolves this coupling by implementing the **Adapter Pattern**.

## Defining the Ruby adapter interface

The key to decoupling is establishing a common contract that all concrete adapters must respect. Since Ruby does not have native interface keywords, we enforce the contract using an abstract base class that raises errors for unimplemented methods:

```ruby
module SharedBroker
  module Adapters
    class Base
      def connect
        raise NotImplementedError, "#{self.class} must implement #connect"
      end

      def publish(topic, payload)
        raise NotImplementedError, "#{self.class} must implement #publish"
      end

      def subscribe(topic, queue_name, &block)
        raise NotImplementedError, "#{self.class} must implement #subscribe"
      end

      def close
        raise NotImplementedError, "#{self.class} must implement #close"
      end
    end
  end
end
```

## The inmemory adapter:Acelerating local testing (tdd)

The `InMemory` adapter enables fast local testing. It simulates the lifecycle of publishing and subscribing in-memory, eliminating the need for running brokers or external network calls during unit test suites:

```ruby
module SharedBroker
  module Adapters
    class InMemory < Base
      def initialize
        @topics = Hash.new { |h, k| h[k] = [] }
      end

      def connect
        # Fast in-memory simulation
        true
      end

      def publish(topic, payload)
        # Synchronously executes all registered callbacks
        @topics[topic].each { |callback| callback.call(payload) }
      end

      def subscribe(topic, queue_name, &block)
        @topics[topic] << block
      end

      def close
        @topics.clear
      end
    end
  end
end
```

## Concrete adapters for production (RabbitMQ and Redis)

For production environments, we inject real adapters that translate common method calls into physical actions:
- **`RabbitMQ` (Bunny):** Manages connection channels, declares exchanges, and routes messages.
- **`Redis` (Redis Pub/Sub):** Performs quick `publish` calls and runs subscriber loops on light-weight channels.

With this structure in place, the application communicates exclusively with the unified client (`SharedBroker::Client.new(adapter: BROKER_ADAPTER)`), decoupling the business layer from physical network adapters.

### Technical terms demystified
- **Adapter Pattern:** A structural design pattern that allows objects with incompatible interfaces to collaborate through a common translator class.
- **TDD (Test-Driven Development):** A software development practice where tests of a system's behavior are written before writing production code.
- **Abstract Class:** A class designed to be inherited rather than instantiated directly.
