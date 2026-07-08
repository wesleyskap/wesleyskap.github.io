---
title: "Loops de múltiplas etapas: Orquestrando agentes autônomos com ActiveJob e ActiveRecord"
excerpt: "Agentes não respondem de primeira. Eles entram em ciclos de pensamento e ação. Aprenda a projetar loops de múltiplas etapas de forma assíncrona, resiliente e totalmente integrada ao ecossistema do Rails."
category: "IA & Agentes"
date: "11 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## A Anatomia de um Loop ReAct (Reasoning and Acting)

Um agente autônomo executa um fluxo de múltiplas etapas de raciocínio e ação. Ao receber um prompt, o modelo analisa se precisa de informações externas, decide chamar uma ferramenta (Tool Call), recebe o resultado e repete o processo até que possa responder satisfatoriamente à pergunta inicial.

Executar essa lógica síncronamente durante o ciclo de vida de uma requisição HTTP tradicional do Rails é um erro grave de design. Chamadas externas de IA demoram segundos e bloqueariam as threads do servidor de aplicação. A solução correta é delegar esse processo para um **Background Job** (ActiveJob) e persistir o estado da conversa no banco de dados (ActiveRecord).

---

## Separando Responsabilidades: O Job como Orquestrador

Seguindo as boas práticas de design, as classes de background job devem ser enxutas e focadas estritamente em orquestrar a execução, delegando a regra de negócio para um Service Object focado na ação: `Ai::ProcessConversationLoop`.

```ruby
# app/jobs/ai/run_agent_loop_job.rb
module Ai
  class RunAgentLoopJob < ApplicationJob
    queue_as :default

    # O job recupera a sessão do banco e dispara a ação
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

## O Service Object do Loop Autônomo

O `ProcessConversationLoop` é o coração do agente. Ele controla o número máximo de iterações permitidas para evitar loops infinitos (o que resultaria em custos astronômicos com APIs), realiza a chamada à API externa coletando logs estruturados e aciona o Tool Registry.

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

        # Se não houver chamadas de ferramentas pendentes, o loop terminou
        break unless message["tool_calls"].present?

        execute_tools(message["tool_calls"])
        @session.save!
      end

      finalize_session
    end

    private

    # Lança erro estruturado detalhando o valor ofensor e o esperado
    def validate_steps!(steps)
      return if steps <= MAX_STEPS

      raise ArgumentError, "Max agent steps exceeded: step count was #{steps}, expected limit is #{MAX_STEPS}"
    end

    # Chamada de API externa monitorada, coletando latência e status
    def call_llm_with_observability
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      
      response = client.chat(
        messages: @session.messages,
        tools: @registry.all_definitions
      )
      
      duration = Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time
      
      # Log estruturado em formato JSON sem vazar tokens ou PII
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
        result = tool ? tool.call(**args) : { error: "Ferramenta não registrada no Registry" }

        # Insere a resposta da ferramenta no histórico da conversa
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
      
      # Notifica a interface do usuário via WebSockets com Hotwire/ActionCable
      Ai::SessionChannel.broadcast_to(@session, response_message: @session.messages.last["content"])
    end

    def client
      @client ||= OpenAI::Client.new
    end
  end
end
```

---

## Mantendo a UI Atualizada Conforme o Agente "Pensa"

Como a execução do loop acontece em segundo plano de forma assíncrona, a experiência de quem usa a aplicação melhora consideravelmente ao atualizarmos a tela de forma reativa. 

Ao fechar a última etapa do loop de raciocínio, o método `finalize_session` executa a transmissão da mensagem de resposta final por meio do `ActionCable` e `Hotwire`. Dessa forma, o front-end renderiza a resposta sem que o usuário precise recarregar a página manualmente, aliando a performance operacional do servidor com uma experiência fluida no cliente.
