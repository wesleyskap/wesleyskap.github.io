---
title: "Disaster Recovery: Reprocessing Failed Messages with the DLQ Redriver Utility"
excerpt: "Failed queues (DLQs) isolate bad messages, but how do we reprocess them? Learn how to design and operate an automated Redriver in the SharedBroker gem."
category: "Operations & Resilience"
date: "26 de Junho, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## When Queues Fail: The Role and Limits of DLQs

In previous posts, we analyzed how to handle temporary instabilities in microservices using retries and exponential backoff. But what happens when the error is permanent? A bug in a field validation or an undocumented schema change will cause all messages in a queue to fail repeatedly.

When this happens, the resilience policy isolates these corrupt messages by sending them to the **Dead Letter Queue (DLQ)**.

The DLQ prevents corrupt messages from blocking the main production channel (avoiding *head-of-line blocking*). However, merely storing errors doesn't solve the business problem. Once the engineering team deploys a hotfix, we need a way to send these messages back to the original queue for successful processing.

To automate this task without manual database updates or custom scripts, the **SharedBroker** gem offers the **DLQ Redrive Utility**.

---

## The Design of the DLQ Redriver

Moving messages back (Redrive) requires caution. We don't want to create infinite loops if messages keep failing, nor do we want to overload the broker. The gem's Redriver reads messages from the DLQ in batches, validates them, and republishes them to the original destination topic, controlling throughput via a `limit` parameter.

### Implementing the Redriver Logic

```ruby
module SharedBroker
  module DLQ
    class Redriver
      def self.redrive(client, dlq_queue, destination_topic, limit: 100)
        # 1. Fetch pending messages from DLQ with a batch limit
        messages = client.adapter.fetch_dlq_messages(dlq_queue, limit: limit)
        
        counter = 0
        messages.each do |message|
          # Remove error metadata headers appended during the previous failure
          clean_payload = extract_payload(message)
          
          # 2. Republish to original topic, triggering validation and encryption
          client.publish(destination_topic, clean_payload)
          
          # 3. Acknowledge and remove old message from DLQ
          client.adapter.acknowledge_dlq_message(dlq_queue, message)
          counter += 1
        end

        Rails.logger.info("[SharedBroker] Redrive completed: #{counter} messages reprocessed.")
        counter
      end

      private

      def self.extract_payload(message)
        # Remove failure metadata like :failed_at, :exception_class, etc.
        envelope = JSON.parse(message, symbolize_names: true)
        envelope.reject { |key, _| [:failed_at, :exception_class, :exception_message].include?(key) }
      end
    end
  end
end
```

---

## Operating Redrives in Production

A best practice for exposing this recovery capability safely in production is wrapping it in a Rails administrative task (Rake Task). This allows systems operators and engineers to trigger reprocessing via command line or automated pipelines:

### Creating the Redrive Rake Task

```ruby
# lib/tasks/shared_broker.rake

namespace :shared_broker do
  desc "Process and send messages from DLQ back to the original queue"
  task :redrive, [:dlq_queue, :topic, :limit] => :environment do |_, args|
    dlq_queue = args[:dlq_queue] || raise("DLQ queue name is required.")
    topic     = args[:topic]     || raise("Destination topic is required.")
    limit     = (args[:limit]    || 50).to_i

    puts "Starting redrive of #{limit} messages from DLQ '#{dlq_queue}' to topic '#{topic}'..."
    
    processed = SharedBroker::DLQ::Redriver.redrive(
      SPOT_BROKER, 
      dlq_queue, 
      topic, 
      limit: limit
    )

    puts "Success! #{processed} messages were moved successfully."
  end
end
```

To run this task in production:

```bash
$ bundle exec rails "shared_broker:redrive[my_consumption_queue.dlq, user.created, 100]"
```

---

## Conclusion

Having a Dead Letter Queue strategy is only half of the resilience equation. The ability to reprocess messages cleanly via tools like the `DLQ Redriver` is what differentiates fragile queue architectures from production-ready, fault-tolerant systems.

### Technical Terms Demystified
- **Head-of-Line Blocking:** A line delay where the first failed message in a queue prevents all subsequent healthy messages from being processed.
- **Acknowledge (Ack):** A confirmation sent to the broker indicating the message was processed successfully, authorizing its removal from the queue.
- **Redrive:** The action of sending failed messages from a DLQ back to the origin queue or topic for reprocessing.
---
