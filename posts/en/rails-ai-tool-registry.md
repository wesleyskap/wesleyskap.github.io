---
title: "Designing a Dynamic and Flexible Tool Registry in Rails"
excerpt: "As your AI agents gain more skills, managing dozens of tools becomes chaotic. Learn how to implement an extensible and testable Registry without resorting to Singletons or global state."
category: "AI & Agents"
date: "July 09, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## The Problem with Singletons in AI Integration

In common AI tutorials, it is very typical to see the `Singleton` pattern used to manage LLM tool registration. However, using persistent global state like `Registry.instance` causes several problems in Rails:
1. **Testing Difficulties**: Testing agent flows in parallel becomes unpredictable if they share the same global instance of registered tools.
2. **Lack of Isolation**: Different agents within the same application might require different subsets of tools.

To avoid these tight couplings and follow the rule of injecting dependencies through constructors or parameters instead of relying on global state, we design a lightweight and decoupled `ToolRegistry`.

---

## The Idiomatic Tool Registry

Our `ToolRegistry` class manages a local set of mapped tools. It is instantiated and configured by the framework during the Rails boot process, making subsequent dependency injection simple.

```ruby
# app/registries/ai/tool_registry.rb
module Ai
  class ToolRegistry
    attr_reader :tools

    def initialize(tools = {})
      @tools = tools
    end

    def register(tool_class)
      name = tool_class.definition.dig(:function, :name)
      @tools[name] = tool_class
    end

    def find(name)
      @tools[name]
    end

    def all_definitions
      @tools.values.map(&:definition)
    end
  end
end
```

---

## Configuring During Rails Boot

To expose tools cleanly without cluttering our services, we initialize the registry inside application configurations within the initializers folder.

```ruby
# config/initializers/ai_tools.rb
Rails.application.config.to_prepare do
  registry = Ai::ToolRegistry.new
  
  # Register authorized tools
  registry.register(Ai::Tools::FetchUserOrders)

  # Bind the configured instance to the global Rails configuration
  Rails.configuration.ai_tool_registry = registry
end
```

Using `to_prepare` ensures that in development environments, the tools are properly reloaded on every request (respecting Zeitwerk's reloading behavior) without causing memory leaks or duplicate registrations.

---

## Injecting the Registry

Instead of accessing a static Singleton in our code, we inject the configured instance as an argument. This makes agent classes easy to test in isolation (simply pass a mocked hash to the constructor).

```ruby
class RunConversation
  def initialize(registry: Rails.configuration.ai_tool_registry)
    @registry = registry
  end

  def execute(prompt)
    # Easy access to all registered tool definitions
    tools_definitions = @registry.all_definitions
    # ...
  end
end
```

This way, the Rails application remains modular, easy to test, and secure against the side effects of shared global state.
