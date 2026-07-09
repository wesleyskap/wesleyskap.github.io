---
title: "Projetando um Tool Registry dinâmico e flexível no Rails"
excerpt: "À medida que seus agentes de IA ganham mais habilidades, gerenciar dezenas de ferramentas vira um caos. Aprenda a implementar um Registry extensível e testável sem recorrer a Singletons ou estado global."
category: "IA & Agentes"
date: "09 de Julho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "rails-ai-agents-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/rails-ai-agents"
---

## O Problema dos Singletons na Integração de IA

Em tutoriais comuns de IA, é muito comum ver o uso do padrão `Singleton` para gerenciar o registro de ferramentas (Tools) do LLM. No entanto, usar estado global persistente como `Registry.instance` gera diversos problemas no Rails:
1. **Dificuldade de Testes**: Testar fluxos de agentes em paralelo fica imprevisível se eles compartilharem a mesma instância global de ferramentas registradas.
2. **Falta de Isolamento**: Diferentes agentes na mesma aplicação podem necessitar de subconjuntos diferentes de ferramentas.

Para evitar esses acoplamentos rígidos e seguir a regra de injetar dependências através de construtores ou parâmetros em vez de depender de estado global, projetamos um `ToolRegistry` leve e desacoplado.

---

## O Tool Registry Idiomático

Nossa classe `ToolRegistry` gerencia um conjunto local de ferramentas mapeadas. Ela é instanciada e configurada pelo próprio framework no boot do Rails, facilitando a injeção de dependência posterior.

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

## Configurando no Boot do Rails

Para expor as ferramentas de forma limpa sem poluir nossos services, inicializamos o registry na configuração da aplicação no arquivo de inicializadores.

```ruby
# config/initializers/ai_tools.rb
Rails.application.config.to_prepare do
  registry = Ai::ToolRegistry.new
  
  # Registrando as ferramentas autorizadas
  registry.register(Ai::Tools::FetchUserOrders)

  # Vincula a instância configurada na configuração global do Rails
  Rails.configuration.ai_tool_registry = registry
end
```

Utilizar `to_prepare` garante que no ambiente de desenvolvimento as ferramentas sejam recarregadas corretamente a cada requisição (respeitando o comportamento de recarregamento do Zeitwerk) sem causar vazamento de memória ou registros duplicados.

---

## Injetando o Registry

Em vez de acessar um Singleton estático em nosso código, injetamos a instância configurada como argumento. Isso torna as classes do agente fáceis de testar em isolamento (basta passar um hash mockado no construtor).

```ruby
class RunConversation
  def initialize(registry: Rails.configuration.ai_tool_registry)
    @registry = registry
  end

  def execute(prompt)
    # Tem acesso fácil a todas as definições das ferramentas registradas
    tools_definitions = @registry.all_definitions
    # ...
  end
end
```

Dessa forma, a aplicação Rails se mantém modular, fácil de testar e segura contra efeitos colaterais de estado global compartilhado.
