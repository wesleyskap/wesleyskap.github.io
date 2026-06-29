---
title: "Seamless State Sync: ActiveRecord Model Sync with vindi-rails-integrations"
excerpt: "Learn how to synchronize ActiveRecord models with Vindi transparently, handling soft deletes, bulk updates, and reconciliation audits."
category: "Fintech & Integrations"
date: "June 29, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/vindi-rails-integrations"
---

## To Sync or Not to Sync: The ActiveRecord Dilemma

When integrating recurring billing platforms, duplicating user registry data across boundaries is a regular requirement. Vindi needs to know your customer's name, email, tax identification numbers, and a local code reference to process card charges and issue invoices properly.

Maintaining these two distinct databases manually leads to boilerplate code inside controllers and increases the chance of human error. If a user updates their email profile locally, you must remember to trigger an API call to update the same field on the gateway.

The extension gem [`vindi-rails-integrations`](https://github.com/wesleyskap/vindi-rails-integrations) solves this synchronization challenge by injecting automated behavior into ActiveRecord models via the `Vindi::Synchronizable` concern.

---

## Automatic Mapping with Vindi::Synchronizable

To enable automatic syncing on an existing model (for example, `User`), start by executing the generator:

```bash
$ rails generate vindi:sync User
$ rails db:migrate
```

This creates a migration adding the `vindi_customer_id` (String) column to the corresponding database table. In your model file, include the concern and define the attributes schema mapping:

```ruby
class User < ApplicationRecord
  include Vindi::Synchronizable

  # Override this method to custom-map the hash sent to Vindi
  def vindi_customer_attributes
    {
      name: "#{first_name} #{last_name}".strip,
      email: email,
      registry_code: document_number, # Cleaned tax ID
      code: "user_#{id}"              # Internal reference ID
    }
  end
end
```

### The Synchronization Lifecycle

Once the concern is integrated, ActiveRecord lifecycle *callbacks* handle remote synchronizations transparently:

1.  **On Create (`after_commit on: :create`)**: The SDK hits Vindi's API to register the customer, waits for the response, and persists the generated `vindi_customer_id` directly in your local table.
2.  **On Update (`after_commit on: :update`)**: The concern monitors changes to mapped fields (like email or name). If local edits occur, an asynchronous or synchronous `Vindi::Customer.update` call is triggered to update the remote database.

---

## Transactional Safety and Bulk Operations

To avoid long-lived network calls blocking local database transactions, you can configure the Transactional Outbox pattern. With `config.use_outbox = true`, callbacks persist synchronization requests to the local `vindi_pending_syncs` table atomically. A background job subsequently processes the outbox queue.

---

## Data Consistency Audits with Rake Tasks

No distributed integration is flawless: network timeouts happen, transactions fail, and manual interventions occur on the Vindi dashboard.

To ensure local and remote datasets remain equivalent, the gem provides an audit task:

```bash
$ bundle exec rake vindi:audit model=User
```

This task performs a comparative audit of the database records:

```text
Analyzing User database...
[Audit] Checking User ID: 102 (Vindi ID: 88762) - Match found.
[Audit] Checking User ID: 103 (Vindi ID: nil) - Missing in Vindi!
[Audit Warning] User ID 103 created in Vindi with customer ID 88763.
Reconciliation complete. 1 missing records synchronized.
```

If it discovers local records lacking a `vindi_customer_id` or carrying mismatched configurations, it resolves the drift dynamically in real time.

---

## Technical Terms Demystified

*   **ActiveRecord Callbacks:** Hooks into the lifecycle of database objects (such as validation, saving, or deletion) allowing custom code execution.
*   **Data Reconciliation:** The process of comparing two sets of records to ensure consistency, correctness, and completeness across distributed nodes.
*   **ActiveRecord Concern:** A pattern in Rails to organize and extract modular, reusable code chunks (including helper methods, scopes, and callbacks) to be shared across models.
