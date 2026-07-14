---
title: "The Evolution of GVL and GIL: From Ruby 1.8 to Ractors and the End of Global Locks"
excerpt: "Understand the history behind GIL and GVL, the transition from Green Threads to OS Threads in Ruby, and how Ractors and the modern ecosystem aim for true parallel execution."
category: "Ruby & Rails"
date: "July 14, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "ruby-rails-internals-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## The origin: GIL vs. GVL

Although often used synonymously, the **GIL (Global Interpreter Lock)** and **GVL (Global VM Lock)** have important historical distinctions in the Ruby ecosystem.

In **Ruby 1.8** and earlier, the interpreter (known as MRI - Matz's Ruby Interpreter) utilized *Green Threads*. Ruby simulated multiple threads at the interpreter level, but the operating system only saw a single real thread. The lock that managed the context-switching of these simulated threads was appropriately named the **GIL** (Global Interpreter Lock) because it controlled the entire interpreter.

The major shift occurred in **Ruby 1.9** with the introduction of the **YARV (Yet Another Ruby VM)** virtual machine developed by Koichi Sasada. Starting from 1.9, Ruby transitioned to using native operating system threads (POSIX threads). Since concurrency was now delegated to the OS kernel, the global lock was redesigned to protect only the internal structures of the Ruby Virtual Machine (YARV) against memory corruption. Thus, the GIL was renamed the **GVL (Global VM Lock)**.

---

## The time-slicing mechanism

In Ruby 1.9 up to Ruby 2.5, the GVL controlled execution by swapping lock ownership between threads in a simple manner: the active thread executed for a time limit (typically 100ms) before a timer thread requested GVL release to allow other concurrent threads to run.

Starting in **Ruby 2.6**, the GVL algorithm was refined to avoid "congestive degradation," reducing context-switching overhead between CPU-bound and I/O-bound threads.

```ruby
# Conceptual simulation of concurrency with cooperative/preemptive context switching
class WorkerPool
  def initialize(tasks)
    @tasks = tasks
  end

  # Clean approach avoiding deep nested loops
  def process_all
    @tasks.each do |task|
      next if task.completed?

      # Process cooperatively by releasing control
      task.execute
      Thread.pass 
    end
  end
end
```

---

## Ruby 3.0+: Ractors and concurrency without a shared GVL

The major revolution in Ruby concurrency came with version 3.0 and the introduction of **Ractors** (formerly known as Guilds).

Unlike traditional threads, each Ractor has its own independent GVL. This means that two Ractors can run in parallel on different CPU cores without blocking each other.

```ruby
# Creating real parallelism with Ractors in Ruby 3
ractor_one = Ractor.new do
  # This Ractor has its own isolated GVL
  results = (1..10_000_000).reduce(:+)
  Ractor.yield(results)
end

ractor_two = Ractor.new do
  # Runs concurrently on another processor core
  results = (1..10_000_000).reduce(:+)
  Ractor.yield(results)
end

# Collecting results without shared mutable state
val_one = ractor_one.take
val_two = ractor_two.take
```

### Why do Ractors eliminate the need for a global GVL?

1. **No Shared State by Default**: Ractors do not share common mutable objects. If you attempt to access a global mutable variable from within a Ractor, Ruby will raise an immediate error.
2. **Message-Passing Communication**: Data must be passed via deep copying (`deep_copy`) or by moving the object's ownership from one Ractor to another, maintaining memory integrity without global locks.

---

## The future: the complete removal of the global lock?

Just as the Python community is implementing the optional removal of the GIL (PEP 703), the Ruby core team works continuously to make the VM thread-safe without global locks in a transparent manner. Until this is fully mature and viable, Ractors remain the official path for CPU parallelism in modern Ruby, while the asynchronous Fiber ecosystem (and the Falcon Web Server) masterfully resolves I/O latency in Rails applications.
