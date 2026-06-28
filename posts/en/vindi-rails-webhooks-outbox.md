---
title: "Guaranteed Event Delivery: Transactional Outbox and Resilient Webhooks in vindi-rails"
excerpt: "Avoid billing inconsistencies caused by network timeouts. Learn how to implement the Transactional Outbox Pattern and secure webhooks in Ruby on Rails."
category: "Fintech & Resilience"
date: "June 28, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/vindi-rails-integrations"
---

## The Risk of Synchronous HTTP Calls Inside Database Transactions

Consider a common anti-pattern in Ruby on Rails development:

```ruby
ActiveRecord::Base.transaction do
  user = User.create!(user_params)
  
  # Synchronous HTTP call inside a local database transaction block
  vindi_customer = Vindi::Customer.create(name: user.name, email: user.email)
  
  user.update!(vindi_id: vindi_customer.id)
end
```

This code carries a critical structural flaw. If Vindi's API experiences high latency (e.g., 10 seconds), the local database connection remains occupied, locking the row and running the risk of connection pool exhaustion. Furthermore, if the HTTP request times out after the database write, the transaction will rollback, leaving an orphan customer created in the gateway.

To decouple local persistence from external network boundaries, the extension library [`vindi-rails-integrations`](https://github.com/wesleyskap/vindi-rails-integrations) introduces two core resilience features: the **Transactional Outbox** pattern and asynchronous **Webhooks** dispatching.

---

## Transactional Outbox Pattern with ActiveRecord

The **Transactional Outbox** pattern addresses distributed consistency by persisting the intention of outbound operations in an auxiliary database table within the same ACID transaction.

You can bootstrap this structure using generators:

```bash
$ rails generate vindi:outbox
```

This creates a `vindi_outbox_events` table locally. Instead of contacting Vindi synchronously in the main web thread, the application enqueues the operation:

```ruby
ActiveRecord::Base.transaction do
  user = User.create!(user_params)
  
  # Register the external synchronization intent in the local outbox table
  Vindi::Outbox.enqueue('Customer', :create, name: user.name, email: user.email, external_owner: user)
end
```

A background worker (running via Sidekiq, Solid Queue, or GoodJob) polls the table, fires the HTTP request to Vindi, and marks the event as processed upon success. If the call fails, the worker retries using exponential backoff, ensuring *At-Least-Once* delivery asynchronously.

---

## Secure Webhooks and Async Processing

Webhooks keep your application updated on state changes happening on the gateway (such as invoices paid, card failures, or subscriptions canceled). However, parsing webhooks synchronously in your controllers exposes your app to security risks and request backlog issues.

To handle webhooks securely and asynchronously:

```bash
$ rails generate vindi:webhook
```

This sets up a dedicated webhook receiver endpoint that:
1.  **Validates Signatures:** Verifies the cryptographic HMAC hash in request headers using your configured secret to prevent spoofing.
2.  **Delegates to Background Jobs:** Immediately saves the payload and queues a `Vindi::WebhookJob`, returning a rapid `200 OK` response to Vindi's server.

### Conventions-Based Event Handlers

To keep your codebase modular, you can generate discrete service objects to handle specific event payloads:

```bash
$ rails generate vindi:webhook_handler subscription_canceled
```

This generates a structured handler class:

```ruby
# app/services/vindi_webhook_handlers/subscription_canceled_handler.rb
module VindiWebhookHandlers
  class SubscriptionCanceledHandler
    def call(event_payload)
      vindi_subscription_id = event_payload.dig('data', 'subscription', 'id')
      subscription = Subscription.find_by!(vindi_id: vindi_subscription_id)
      subscription.update!(status: :canceled)
    end
  end
end
```

The underlying `WebhookJob` inspects incoming events and dynamically dispatches them to the corresponding handler class by name convention, preventing bloated controller files.

---

## Technical Terms Demystified

*   **Transactional Outbox Pattern:** A design pattern that guarantees atomic execution of database updates and corresponding outbound event messaging, preventing data drift if a network error occurs.
*   **At-Least-Once Delivery:** A delivery guarantee where a message or integration call is assured to reach its target destination at least once, potentially repeating the execution in case of retries.
*   **HMAC (Hash-based Message Authentication Code):** A message authentication protocol combining a cryptographic hash function with a secret key. Used to prove webhook authenticity.
