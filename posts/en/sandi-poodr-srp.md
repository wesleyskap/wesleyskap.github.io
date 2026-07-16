---
title: "POODR in Practice: Single Responsibility and Healthy Coupling"
excerpt: "How do you build classes that are easy to change? Discover Sandi Metz's practical teachings from POODR on single responsibility, dependency injection, and the Law of Demeter."
category: "Design Patterns"
date: "July 16, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Designing for change

In her highly acclaimed book *Practical Object-Oriented Design in Ruby* (POODR), Sandi Metz defines well-designed code not as code that is perfect on day one, but as code that is **easy to change** in the future.

This ease of change relies on two fundamental pillars of object-oriented design: the **Single Responsibility Principle (SRP)** and **Dependency Management**.

---

## Single Responsibility Principle (SRP)

A class should have only one reason to change. If you need to describe what a class does using conjunctions ("and", "or"), it probably has too many responsibilities.

In Rails, we commonly see models carrying both business logic and presentation concerns. The solution suggested by POODR is to isolate these concerns into smaller plain objects (POROs) or to delegate the responsibility to the object that truly owns it.

---

## Dependency injection (DI)

Tight coupling is the number one enemy of refactoring. When class `A` directly instantiates class `B` internally, it inherits all of `B`'s dependencies and limitations.

```ruby
# Before: Tight coupling (makes unit testing and future replacement difficult)
class NotificationSender
  def deliver(message)
    # Direct instantiation creates a hard dependency on the Twilio API
    client = Twilio::REST::Client.new
    client.messages.create(body: message, to: "+1234567")
  end
end
```

Sandi Metz's solution is simple: **inject the dependency**. Pass the collaborator object ready-made as an argument to the constructor or the method.

```ruby
# After: Dependency injection via parameter
class NotificationSender
  def initialize(client: Twilio::REST::Client.new)
    @client = client
  end

  def deliver(message, target)
    @client.messages.create(body: message, to: target)
  end
end
```

### Why is this shift revolutionary?

1. **Painless Testing**: You can now test `NotificationSender` by passing a simple mock (a *double* or test double) instead of having to initialize or stub the entire Twilio library in your unit tests.
2. **Transparent Replacement**: If you decide to switch from Twilio to SendGrid to send certain messages tomorrow, the `NotificationSender` class remains untouched. You simply inject a different adapter that responds to the same public interface (`messages.create`).

---

## The Law of Demeter

Another topic thoroughly detailed by Sandi Metz in POODR is the coupling of messages that violate the **Law of Demeter** (often summarized as "only talk to your immediate friends").

In Rails, it is extremely common to see long method chains that break encapsulation:

```ruby
# Before: Classic Law of Demeter violation (tight coupling to object structures)
class Invoice
  def customer_phone
    # Invoice needs to know that Customer has a Profile and Profile has a Phone
    customer.profile.phone
  end
end
```

If the structure of `Profile` changes, `Invoice` will break silently. To solve this using POODR techniques, we hide the internal structure using delegation (or Rails' built-in `delegate` method):

```ruby
# After: Hiding internal structure via clean delegation
class Invoice
  belongs_to :customer

  # Delegate the message directly
  delegate :phone, to: :customer, prefix: true
end

class Customer
  has_one :profile

  # Delegate to profile under the hood
  delegate :phone, to: :profile
end
```

Now, we simply call `@invoice.customer_phone`. The `Invoice` class only talks to its "immediate friend" (`customer`), maintaining the independence and resilience of the codebase against future changes in sub-structures.
