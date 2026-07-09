---
title: "Function Calling limpo no Rails: Mapeando métodos com segurança e tipagem"
excerpt: "Integrar LLMs com a lógica de negócio do Rails exige segurança e estrutura. Veja como usar Plain Old Ruby Objects (POROs) para declarar schemas e executar funções de forma idiomática."
category: "IA & Agentes"
date: "08 de Julho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## Conectando Modelos de Linguagem ao Banco de Dados

Expor dados e ações internas para um LLM (como GPT-4 ou Claude) decidir quando executar exige um formato de comunicação estruturado. A ferramenta de **Function Calling** permite que a IA responda com um JSON descrevendo qual função rodar e com quais argumentos.

No entanto, o maior erro ao implementar isso em aplicações Rails é construir hashes gigantescos nos controllers ou usar `eval` dinâmico para rodar código. Para manter a codebase limpa e segura, recorremos a Plain Old Ruby Objects (POROs) focados em ações únicas de negócio.

---

## Declarando Ferramentas com POROs

Cada ação que o LLM pode disparar deve ser representada por uma classe isolada que define seu próprio schema em conformidade com o formato OpenAPI/JSON Schema exigido pelas APIs de IA.

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
            description: "Recupera os últimos pedidos de um usuário com base no e-mail.",
            parameters: {
              type: "object",
              properties: {
                email: { type: "string", description: "O e-mail do cliente no sistema." },
                limit: { type: "integer", description: "Quantidade máxima de pedidos para retornar (default 5)." }
              },
              required: ["email"]
            }
          }
        }
      end

      def self.call(email:, limit: 5)
        user = User.find_by(email: email)
        return { error: "Usuário não encontrado" } unless user

        orders = user.orders.order(created_at: :desc).limit(limit)
        orders.map { |o| { id: o.id, total: o.total.to_f, status: o.status } }
      end
    end
  end
end
```

### Por que essa estrutura funciona?

1. **Responsabilidade Única (SRP)**: A classe se preocupa apenas em definir como ela deve ser invocada e como ela processa esses parâmetros.
2. **Segurança de Entrada**: O método `call` utiliza argumentos nomeados obrigatórios e valores padrão, garantindo que o Ruby levante um erro estruturado caso os tipos estejam inconsistentes ou ausentes na requisição da API.

---

## Execução Segura e Despacho de Funções

Nunca confie cegamente nos parâmetros enviados por uma API externa. Para evitar injeção de código ou chamadas a classes arbitrárias do Rails, definimos uma lista estrita de mapeamentos e usamos *Early Returns* para mitigar falhas silenciosas.

```ruby
# Exemplo de processamento em um fluxo de atendimento
tool_call = response.dig("choices", 0, "message", "tool_calls", 0)
return if tool_call.nil?

function_name = tool_call.dig("function", "name")
arguments = JSON.parse(tool_call.dig("function", "arguments"), symbolize_names: true)

# Whitelist estrita de ferramentas permitidas
ALLOWED_TOOLS = {
  "fetch_user_orders" => Ai::Tools::FetchUserOrders
}.freeze

tool_klass = ALLOWED_TOOLS[function_name]
return { error: "Ferramenta não permitida ou inexistente" } unless tool_klass

# Execução segura
result = tool_klass.call(**arguments)
```

Essa abordagem garante que mesmo se o LLM "alucinar" e tentar chamar métodos de sistema ou de outros modelos ActiveRecord, o dispatch falhará na whitelist de forma segura e imediata.
