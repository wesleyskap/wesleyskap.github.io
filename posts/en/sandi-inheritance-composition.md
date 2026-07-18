---
title: "Inheritance vs. Composition: When Duplicating is Better Than Abstracting Incorrectly"
excerpt: "Early abstractions create tight coupling and confusing inheritance. Discover Sandi Metz's advice on composition, Concerns, and the value of duplication."
category: "Design Patterns"
date: "July 18, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## The trap of early abstraction

One of Sandi Metz's most famous mantras is: **"Duplication is far cheaper than the wrong abstraction."**

Often, upon seeing two similar lines of code, we immediately create an inheritance hierarchy or a shared module (such as `ActiveSupport::Concern` in Rails) to reuse it. The problem is that, in the future, as business requirements change in different directions for each context, the inherited class becomes a monster filled with internal conditionals to accommodate behavioral exceptions.

---

## Inheritance (*is-a*) vs. composition (*has-a*)

* **Inheritance**: Models relationships where one object **is** a specialization of another. Inheritance creates tight coupling and strict code dependency (any change in the parent class affects all subclasses).
* **Composition**: Models relationships where one object **has** or delegates to another collaborator. It represents loose, flexible coupling based strictly on the public interface.

### The danger of ill-planned inheritance

Imagine a hierarchy for exporting reports:

```ruby
# Before: Inheritance generating tight coupling of behavior
class Report
  def export
    prepare_data
    render_format
  end
end

class PdfReport < Report
  def render_format
    # PDF-specific logic
  end
end
```

If we need a report that is emailed instead of directly downloaded, the inheritance structure begins to break or require messy conditionals. Sandi Metz's solution is to use **Composition**:

```ruby
# After: Composition based on flexible adapter injection
class Report
  def initialize(exporter:)
    @exporter = exporter
  end

  def export(data)
    # Simple delegation of behavior
    @exporter.export(data)
  end
end

class PdfExporter
  def export(data)
    # Isolated PDF export logic
  end
end

class EmailExporter
  def export(data)
    # Isolated email sending logic
  end
end
```

---

## What about Rails concerns and mixins?

In Rails, using `ActiveSupport::Concern` to share code across models is extremely common. However, Sandi Metz warns that **mixins and concerns are multiple inheritance in disguise**.

If you include a `Commentable` module in your `Post` model, you are stating that `Post` *is-a* `Commentable`. If your concern merely injects random methods to reduce the file size of the main model, you are simply sweeping complexity under the rug. The complexity remains; it's just split across different files.

Before creating a Concern, evaluate whether the logic should be an independent object (composition):

```ruby
# Before: Concern coupling behavior to the model lifecycle
module Searchable
  extend ActiveSupport::Concern
  
  included do
    after_commit :index_in_elasticsearch
  end
  
  def index_in_elasticsearch
    # ...
  end
end
```

Instead of coupling Elasticsearch to the model lifecycle through inheritance/mixins, use composition inside a Service Object that manages the flow:

```ruby
# After: Composition encapsulated in a Service Object
class CreatePost
  def self.call(params)
    ActiveRecord::Base.transaction do
      post = Post.create!(params)
      IndexerService.index(post) # Clear and explicit dependency
      post
    end
  end
end
```

---

## When to choose which?

1. **Use Composition by Default**: If behaviors vary or depend on external services, use composition. It allows you to inject different execution strategies and simplifies testing.
2. **Use Inheritance Only for Strictly Stable Hierarchies**: If the variant behavior is purely a detail of stable, well-defined specialization in the domain (e.g., mathematical subclasses or strict system data types), inheritance can be safely applied.
