---
title: "Optimization and Idempotency: Automatic Payload Compression and Deduplication Middleware"
excerpt: "Large payloads and duplicate messages are common challenges in distributed systems. Learn how to compress payloads dynamically and guarantee idempotency in SharedBroker."
category: "Performance & Concurrency"
date: "22 de Junho, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## The Challenges of Message Volume and Duplication

In high-throughput distributed systems, efficiency and consistency are crucial. As applications scale, they inevitably hit two silent but devastating bottlenecks:
1. **Network Bandwidth and Storage Overhead:** Sending large JSON payloads (such as consolidated reports or structured listings) inflates network traffic and bloats queue storage.
2. **Duplicate Message Processing (At-Least-Once Delivery):** Since most message brokers guarantee "at-least-once" delivery, temporary network hiccups or acknowledgment timeouts cause the same event to be consumed multiple times, risking severe data inconsistencies (such as charging a customer twice).

To solve these challenges, the **SharedBroker** gem provides two built-in defenses: **Automatic Payload Compression** and an **Idempotency Middleware**.

---

## 1. Dynamic and Transparent Payload Compression

Instead of compressing data manually in your business code before publishing, `SharedBroker` handles compression transparently. We configure an algorithm (like `:gzip` or `:deflate`) and a size threshold in bytes. Payloads that don't reach the threshold pass through untouched, avoiding unnecessary computational overhead for small messages.

### How Compression Works Under the Hood

The gem wraps the payload in a metadata envelope that signals whether compression took place. When the subscriber receives the event, it automatically detects the flag and decompresses the payload before handing the JSON back to your execution block.

```ruby
require 'zlib'
require 'json'

module SharedBroker
  module Compression
    class Gzip
      def self.compress(data)
        # Compresses the string and returns the packed bytes
        io = StringIO.new
        gz = Zlib::GzipWriter.new(io)
        gz.write(data)
        gz.close
        io.string
      end

      def self.decompress(data)
        # Decompresses the received bytes back to the original string
        io = StringIO.new(data)
        gz = Zlib::GzipReader.new(io)
        result = gz.read
        gz.close
        result
      end
    end
  end
end
```

### Configuring the Application

Enabling compression globally in your initializer is simple and requires zero changes to your publish or subscribe calls:

```ruby
SharedBroker.configure do |config|
  # Enable compression using gzip
  config.compression_algorithm = :gzip
  # Set threshold to 1 KB (1024 bytes)
  config.compression_threshold = 1024
end
```

---

## 2. Idempotency Middleware for Consumers

Ensuring idempotency means guaranteeing that no matter how many times the same event is received, the corresponding action is executed only once.

`SharedBroker` implements a middleware pattern that intercepts incoming messages, extracts or generates a unique correlation identifier (`correlation_id`), and checks if it has already been processed using your configured cache store (such as `Rails.cache` or `Redis`).

### Deduplication Middleware Logic

```ruby
module SharedBroker
  module Middlewares
    class Idempotency
      def initialize(store:, expires_in: 86400)
        @store = store
        @expires_in = expires_in
      end

      def call(topic, queue_name, envelope)
        correlation_id = envelope[:correlation_id]
        
        # If the message has no correlation_id, process without deduplication
        return yield if correlation_id.nil?

        cache_key = "shared_broker:processed:#{queue_name}:#{correlation_id}"

        # Attempt to write the ID in cache atomically
        if @store.write(cache_key, "processed", nx: true, expires_in: @expires_in)
          begin
            yield
          rescue => e
            # On failure, release the cache key to allow retrying
            @store.delete(cache_key)
            raise e
          end
        else
          # Silently discard to prevent duplicate processing
          Rails.logger.info("[SharedBroker] Duplicate message skipped: #{correlation_id}")
        end
      end
    end
  end
end
```

### Registering the Middleware in the Client

In your microservice initialization file:

```ruby
# Initialize the middleware pointing to the Rails cache
idempotency_middleware = SharedBroker::Middlewares::Idempotency.new(
  store: Rails.cache,
  expires_in: 86400 # Keep the correlation record for 24 hours
)

SPOT_BROKER = SharedBroker::Client.new(
  adapter: BROKER_ADAPTER,
  middlewares: [idempotency_middleware]
)
```

---

## Conclusion

Adopting payload compression and idempotency middlewares changes message transport from a simple data pipe into an intelligent, high-performance flow. With these native tools in `SharedBroker`, we eliminate the threat of duplicate database writes while optimizing network performance in a single clean architecture.

### Technical Terms Demystified
- **Deduplication:** The process of identifying and discarding duplicate instances of identical messages in a continuous stream.
- **nx: true:** An option used in caching to write a key only if it does not already exist (an atomic check-and-set operation).
- **Correlation ID:** A unique key attached to messages to trace related execution paths or guarantee processing uniqueness.
---
