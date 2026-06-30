---
title: "Decoupled and resilient recurring payments:Introducing the vindi-rails SDK"
excerpt: "Integrate your Rails app with Vindi's recurring billing platform. Support dynamic thread-safe multi-tenancy, built-in caching, and intelligent retries."
category: "Fintech & Integrations"
date: "June 27, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/vindi-rails"
---
## The payment integration challenge

In systems operating under subscription and recurring billing models, integrating with a payment gateway is not just a secondary feature; it is the financial core of your application. Communication failures or timeouts during billing creation can lead to severe inconsistencies: customers charged twice or subscriptions active on the provider side that aren't registered locally.

Additionally, payment gateways enforce request throughput restrictions (*rate limits*). Making synchronous requests to fetch data that changes infrequently (such as subscription plans, accepted payment methods, or products) introduces unnecessary latency for end users and wastes API quotas.

The `vindi-rails` SDK was designed to address these concerns in the Ruby on Rails ecosystem, offering a thread-safe, resilient abstraction layer with native caching support.

---
## Resource-based architecture and thread safety

Unlike traditional approaches that rely on global variables to manage API states, `vindi-rails` implements a decoupled configuration pattern that is completely *thread-safe*. This is essential for modern web servers (such as Puma) running in concurrent multi-threaded environments.

To configure the SDK globally, write a standard application initializer:

```ruby
Vindi.configure do |config|
  config.api_key = ENV['VINDI_API_KEY']
  config.api_url = 'https://gp.vindi.com.br/api/v1' # Defaults to Sandbox
end
```

### The power of dynamic configuration (multi-tenancy)

For SaaS applications where multiple partners or clients (merchants) connect using their own Vindi credentials, the SDK provides the `with_config` method. This isolates credentials dynamically inside the scope of the current thread of execution:

```ruby
# Execute API calls using specific credentials in a thread-safe manner
Vindi.with_config(api_key: 'merchant_private_api_key') do
  # All API requests inside this block will use the temporary configuration
  merchant_customers = Vindi::Customer.list
end

# Outside the block, the global configuration is restored automatically
```

Under the hood, `with_config` manages variables using `Thread.current`, ensuring absolute isolation in highly concurrent environments.

---
## Latency reduction via local caching

Querying the remote gateway on every web request to list available subscription plans is a poor engineering practice. `vindi-rails` lets you configure a cache provider (such as the Rails cache) and specify which semi-static resources should be stored in memory:

```ruby
Vindi.configure do |config|
  config.cache_store = Rails.cache
  config.cache_ttl = 300 # 5 minutes TTL
  config.cached_resources = [:plans, :payment_methods, :products]
end
```

When caching is enabled, methods like `Vindi::Plan.list` or `Vindi::PaymentMethod.list` intercept network requests and serve results directly from the local store if the cache key is valid. This drops API response times from hundreds of milliseconds to under 5ms.

---
## Intelligent and resilient API calls

Transient network glitches are inevitable. The SDK protects execution flows by performing automatic retries with exponential backoff and random noise (*jitter*) when encountering transport failures or rate limit responses (HTTP status `429 Too Many Requests`):

```ruby
Vindi.configure do |config|
  config.max_retries = 3
  config.retry_backoff_factor = 2
  config.retry_base_delay = 1.0 # Wait 1s, then 2s, then 4s...
end
```

This guarantees that brief connectivity interruptions do not raise unexpected exceptions in your checkout flow, boosting application stability.

---
## Technical terms demystified

*   **Thread-safe:** Code or data structures that can be accessed concurrently by multiple execution threads without causing race conditions or state corruption.
*   **Multi-tenancy:** A software architecture where a single instance of an application serves multiple distinct clients (tenants). In billing systems, it allows processing transactions for different accounts on the same codebase.
*   **Rate Limits:** Restrictions imposed by API servers to limit the number of requests a client can transmit over a specified window to prevent resource exhaustion.
