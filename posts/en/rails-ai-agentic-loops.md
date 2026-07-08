---
title: "Multi-Step Loops: Orchestrating Autonomous Agents with ActiveJob and ActiveRecord"
excerpt: "Agents don't reply immediately. They enter cycles of thinking and acting. Learn how to design multi-step loops asynchronously, resiliently, and fully integrated with the Rails ecosystem."
category: "AI & Agents"
date: "July 11, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## The Anatomy of a ReAct Loop (Reasoning and Acting)

An autonomous agent runs a multi-step loop of reasoning and acting. Upon receiving a prompt, the model analyzes whether it needs external information, decides to call a tool (Tool Call), receives the output, and repeats the process until it can answer the initial query satisfactorily.

Executing this logic synchronously during the lifecycle of a traditional Rails HTTP request is a severe design error. External AI calls take seconds and would block application server threads. The correct solution is to delegate this process to a **Background Job** (ActiveJob) and persist the conversation state in the database (ActiveRecord).

---

## Separating Responsibilities: The Job as Orchestrator

Following design best practices, background job classes should be lean and strictly focused on orchestrating execution, delegating business logic to a Service Object focused on the action: `Ai::ProcessConversationLoop`.

```ruby
# app/jobs/ai/run_agent_loop_job.rb
module Ai
  class RunAgentLoopJob < ApplicationJob
    queue_as :default

    # The job retrieves the session from the database and triggers the action
    def perform(session_id)
      session = AiSession.find(session_id)
      return if session.completed?

      registry = Rails.configuration.ai_tool_registry
      Ai::ProcessConversationLoop.call(session: session, registry: registry)
    end
  end
end
```

---

## The Autonomous Loop Service Object

`ProcessConversationLoop` is the heart of the agent. It controls the maximum number of iterations allowed to prevent infinite loops (which would result in astronomical API costs), makes the call to the external API collecting structured logs, and triggers the Tool Registry.

```ruby
# app/services/ai/process_conversation_loop.rb
module Ai
  class ProcessConversationLoop
    MAX_STEPS = 8

    def self.call(session:, registry:)
      new(session: session, registry: registry).call
    end

    def initialize(session:, registry:)
      @session = session
      @registry = registry
    end

    def call
      steps = 0
      
      loop do
        steps += 1
        validate_steps!(steps)

        response = call_llm_with_observability
        message = response.dig("choices", 0, "message")
        @session.messages << message

        # If there are no pending tool calls, the loop has finished
        break unless message["tool_calls"].present?

        execute_tools(message["tool_calls"])
        @session.save!
      end

      finalize_session
    end

    private

    # Raises a structured error detailing the offending value and the expected value
    def validate_steps!(steps)
      return if steps <= MAX_STEPS

      raise ArgumentError, "Max agent steps exceeded: step count was #{steps}, expected limit is #{MAX_STEPS}"
    end

    # Monitored external API call, collecting latency and status
    def call_llm_with_observability
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      
      response = client.chat(
        messages: @session.messages,
        tools: @registry.all_definitions
      )
      
      duration = Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time
      
      # JSON-formatted structured log without leaking tokens or PII
      Rails.logger.info({
        event: "llm_api_call",
        duration_seconds: duration.round(3),
        status: response ? "success" : "failed",
        session_id: @session.id
      }.to_json)

      response
    end

    def execute_tools(tool_calls)
      tool_calls.each do |tool_call|
        name = tool_call.dig("function", "name")
        args = JSON.parse(tool_call.dig("function", "arguments"), symbolize_names: true)

        tool = @registry.find(name)
        result = tool ? tool.call(**args) : { error: "Tool not registered in Registry" }

        # Inserts the tool response into the conversation history
        @session.messages << {
          role: "tool",
          tool_call_id: tool_call["id"],
          name: name,
          content: result.to_json
        }
      end
    end

    def finalize_session
      @session.update!(status: "completed")
      
      # Notifies the user interface via WebSockets with Hotwire/ActionCable
      Ai::SessionChannel.broadcast_to(@session, response_message: @session.messages.last["content"])
    end

    def client
      @client ||= OpenAI::Client.new
    end
  end
end
```

---

## Keeping the UI Updated as the Agent \"Thinks\"

Because the loop execution happens asynchronously in the background, the user experience improves significantly by updating the screen reactively.

Upon completing the final reasoning step, the `finalize_session` method broadcasts the final response message using `ActionCable` and `Hotwire`. This allows the front-end to render the reply without requiring the user to reload the page, combining server performance with a seamless client-side experience.
