---
title: "Demystifying Ruby's GVL (Global VM Lock): Myths, Truths, and Concurrency"
excerpt: "What is the GVL (Global VM Lock) and how does it actually affect concurrency and parallelism in your Ruby and Rails applications? Learn what happens under the hood of MRI."
category: "Ruby & Rails"
date: "July 13, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "ruby-rails-internals-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Concurrency vs. parallelism in MRI

Many junior Rails developers believe that Ruby is purely single-threaded due to the **GVL (Global VM Lock)**. The reality is more subtle: Ruby supports native operating system threads (POSIX threads), but the GVL ensures that only one thread executes Ruby bytecode (interpreted code) at any given time within a single process.

This limitation historically exists to protect the internal structures of the default interpreter (MRI) from race conditions, eliminating the need for complex memory locks at the C level. But does this mean threads are useless in Ruby? Absolutely not.

---

## The GVL is released on blocking I/O

The GVL is a smart lock. Whenever a Ruby thread performs a blocking I/O operation (such as reading from the database, sending an external HTTP request, or waiting for disk writes), the MRI releases the GVL so that other threads can run Ruby code while the OS kernel processes the I/O.

### Practical example: I/O vs. CPU bound

Let's look at two scenarios. The first is purely mathematical (CPU Bound), where the GVL acts as a bottleneck:

```ruby
# CPU Bound Example
def compute_factorial(number)
  return 1 if number <= 1

  (1..number).reduce(:*)
end

# Sequential vs Threads execution in math calculations
# Threads do not bring performance gains here due to the GVL.
threads = 4.times.map do
  Thread.new { compute_factorial(100_000) }
end
threads.each(&:join)
```

However, in an I/O Bound scenario (the common case in Rails: database queries, external APIs, caching), threads scale almost linearly:

```ruby
require "net/http"

# I/O Bound Example
def fetch_api_status(url)
  uri = URI(url)
  # The GVL is released during the HTTP connection and read by the kernel
  response = Net::HTTP.get_response(uri)
  
  response.code
rescue SocketError => e
  # Clear exception messages containing the offending value
  raise ConnectionError.new(offending_url: url), "Failed to connect to #{url}: #{e.message}"
end

urls = [
  "https://api.github.com",
  "https://api.slack.com",
  "https://api.stripe.com"
]

# Executing concurrent calls using threads
threads = urls.map do |url|
  Thread.new { fetch_api_status(url) }
end
threads.each(&:join)
```

While Thread 1 waits for the network response from GitHub, the GVL is released and Thread 2 can immediately start preparing the call to Slack.

---

## How does Rails benefit from this?

Multithreaded web servers for Rails (like **Puma**) utilize this exact behavior. If your controller performs complex queries in Postgres or calls microservices via HTTP, a single Puma process configured with 5 threads will be able to process multiple concurrent requests, as the GVL is constantly released while threads wait for the database.

### Best design practices under the GVL

1. **Avoid sharing mutable state**: Threads in Ruby share the same memory space. Use immutable data structures or encapsulate thread-safe state using `Thread.current` sparingly, or use dedicated concurrency libraries.
2. **Delegate CPU Bound tasks to separate Background Jobs**: Heavy image processing, encryption, or complex analytical reports should not run on the request thread. Move them to workers (like Sidekiq or Solid Queue) to prevent the GVL from locking other I/O threads on the Puma server.
3. **Explore Ractors for real parallelism**: Starting with Ruby 3, the **Ractor** mechanism allows real CPU parallelism without a shared GVL, isolating state and exchanging data strictly through message passing.
