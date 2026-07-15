---
title: "Sandi Metz's 4 Rules of Design: Practicality Without Compromise in Rails"
excerpt: "Is your model or controller getting too fat? Discover the 4 rules of size and scope proposed by Sandi Metz to ensure sustainable and readable software design in Rails."
category: "Design Patterns"
date: "July 15, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Simplifying chaos in Rails

As a Rails application grows, it's very common for controllers to accumulate unwanted business logic and for ActiveRecord models to bloat into files with thousands of lines of hard-to-test code (the notorious *Fat Model* pattern).

To combat this problem, the renowned developer **Sandi Metz** suggested four basic rules for file size and scope. Although they may seem restrictive at first glance, they were not created to be dogmatic prisons, but rather **triggers for reflection**. When you violate one of these rules, the Ruby interpreter doesn't break, but your design flashes a red warning signal.

---

## The 4 golden rules

1. **Classes must not have more than 100 lines of code.**
2. **Methods must not have more than 5 lines of code.**
3. **Methods must not accept more than 4 arguments** (preferably using named arguments or options hashes to avoid order dependency).
4. **Controllers must instantiate at most one object to pass to the view.**

### Deep dive into the controller rule (only 1 object)

The fourth rule is one of the most violated in the Rails ecosystem. Typically, we create controllers that expose 3 or 4 instance variables to the view (e.g., `@user`, `@orders`, `@payment_methods`). This causes the View to be coupled to the format and database query details of multiple objects, breaking the abstraction barrier.

Sandi suggests using a **Facade** or a **View Object** (also called a *Presenter*) to encapsulate all of this information into a single coherent object.

```ruby
# Before: Controller violating Sandi Metz's fourth rule
class DashboardController < ApplicationController
  def show
    @user = current_user
    @orders = current_user.orders.limit(5)
    @notifications = current_user.notifications.unread
  end
end
```

Refactoring with a View Object/Presenter, the controller passes only one entity, and the view consumes structured methods:

```ruby
# app/presenters/dashboard_presenter.rb
class DashboardPresenter
  def initialize(user)
    @user = user
  end

  def user_name
    @user.name
  end

  def recent_orders
    @user.orders.limit(5)
  end

  def unread_notifications
    @user.notifications.unread
  end
end

# After: Controller respecting the rule
class DashboardController < ApplicationController
  def show
    @dashboard = DashboardPresenter.new(current_user)
  end
end
```

---

## Applying the rule in practice (method refactoring)

Imagine a common scenario: processing a purchase order and sending notifications. Here is how a method tends to grow and accumulate responsibilities:

```ruby
# Before: Accumulating responsibilities and exceeding 5 lines
class Order
  def process_and_notify(user, gateway)
    return false unless user.active?
    
    transaction do
      update!(status: :processed)
      payment = gateway.charge(total)
      user.notifications.create!(message: "Payment of #{total} approved")
      OrderMailer.receipt(self).deliver_later
    end
    true
  end
end
```

Following Sandi Metz's rules (short methods, SRP, and early returns), we delegate business actions to focused classes and simplify the main flow:

```ruby
# After: Short methods (< 5 lines) and single responsibility
class ProcessOrder
  def self.call(order, gateway)
    new(order, gateway).call
  end

  def initialize(order, gateway)
    @order = order
    @gateway = gateway
  end

  def call
    return false unless customer_active?

    execute_payment_flow
  end

  private

  def customer_active?
    @order.user.active?
  end

  def execute_payment_flow
    ActiveRecord::Base.transaction do
      @order.update!(status: :processed)
      @gateway.charge(@order.total)
      notify_customer
    end
    true
  end

  def notify_customer
    @order.user.notifications.create!(message: "Payment approved")
    OrderMailer.receipt(@order).deliver_later
  end
end
```

---

## Why follow these rules?

* **Immediate Testability**: Testing a 3 or 4-line method that does only one thing is trivial. You eliminate the need for giant test setups.
* **Natural Composition**: When forced to break classes down to under 100 lines, you naturally begin creating smaller, focused Service Objects, Form Objects, and Query Objects instead of bloating Rails models.
* **Readability**: Short methods drastically reduce the mental load for anyone reading the code, allowing them to grasp the main flow of the software in the blink of an eye.
