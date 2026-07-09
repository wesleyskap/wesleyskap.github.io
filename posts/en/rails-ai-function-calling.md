---
title: "Clean Function Calling in Rails: Mapping Methods Safely and Strongly Typed"
excerpt: "Integrating LLMs with Rails business logic requires security and structure. Learn how to use Plain Old Ruby Objects (POROs) to declare schemas and execute functions idiomatically."
category: "AI & Agents"
date: "July 8, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## Connecting Language Models to Your Database

Exposing internal data and actions to an LLM (like GPT-4 or Claude) so it can decide when to execute them requires a structured communication format. The **Function Calling** feature allows the AI to respond with a JSON describing which function to run and with what arguments.

However, the biggest mistake when implementing this in Rails applications is building giant hashes inside controllers or using dynamic `eval` to run code. To keep the codebase clean and secure, we turn to Plain Old Ruby Objects (POROs) focused on a single business action.

---

## Declaring Tools with POROs

Each action that the LLM can trigger should be represented by an isolated class that defines its own schema in compliance with the OpenAPI/JSON Schema format required by AI APIs.

```ruby
# app/services/ai/tools/fetch_user_orders.rb
module Ai
  module Tools
    class FetchUserOrders
      def self.definition
        {
          type: "function",
          function: {
            name: "fetch_user_orders",
            description: "Retrieves the latest orders for a user based on their email.",
            parameters: {
              type: "object",
              properties: {
                email: { type: "string", description: "The customer's email in the system." },
                limit: { type: "integer", description: "Maximum number of orders to return (default 5)." }
              },
              required: ["email"]
            }
          }
        }
      end

      def self.call(email:, limit: 5)
        user = User.find_by(email: email)
        return { error: "User not found" } unless user

        orders = user.orders.order(created_at: :desc).limit(limit)
        orders.map { |o| { id: o.id, total: o.total.to_f, status: o.status } }
      end
    end
  end
end
```

### Why does this structure work?

1. **Single Responsibility Principle (SRP)**: The class is solely concerned with defining how it should be invoked and how it processes those parameters.
2. **Input Safety**: The `call` method uses required named arguments and default values, ensuring that Ruby raises a structured error if types are mismatched or missing in the API request.

---

## Safe Execution and Function Dispatching

Never blindly trust the parameters sent by an external API. To prevent code injection or calls to arbitrary Rails classes, we define a strict whitelist of mappings and use *Early Returns* to mitigate silent failures.

```ruby
# Example of processing in a customer service flow
tool_call = response.dig("choices", 0, "message", "tool_calls", 0)
return if tool_call.nil?

function_name = tool_call.dig("function", "name")
arguments = JSON.parse(tool_call.dig("function", "arguments"), symbolize_names: true)

# Strict whitelist of allowed tools
ALLOWED_TOOLS = {
  "fetch_user_orders" => Ai::Tools::FetchUserOrders
}.freeze

tool_klass = ALLOWED_TOOLS[function_name]
return { error: "Tool not permitted or non-existent" } unless tool_klass

# Safe execution
result = tool_klass.call(**arguments)
```

This approach ensures that even if the LLM "hallucinates" and tries to call system methods or other ActiveRecord models, the dispatch will fail safely and immediately.
