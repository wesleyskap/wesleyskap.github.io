---
title: "Controle de Concorrência, Backpressure Adaptativo e Roteamento Híbrido Multi-Adapter"
excerpt: "Como evitar sobrecarga de bancos de dados locais e rotear eventos para múltiplos brokers de forma híbrida em microsserviços Ruby? Veja a solução."
category: "Alta Performance"
date: "03 de Junho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## Saturação de Recursos locais em Consumos Assíncronos

Um consumidor de fila rápido pode se tornar um grande perigo para a saúde do seu microsserviço. Se o broker de mensageria possuir milhões de mensagens represadas e as entregar ao seu consumidor sem limites, as threads de background do Rails irão processar tudo concorrentemente. Em segundos, esse processamento paralelo gerará exaustão de conexões no banco de dados local (`ActiveRecord::ConnectionTimeoutError`), derrubando a API principal.

Para evitar isso, precisamos de duas disciplinas de engenharia de software na camada de consumo: **Controle de Concorrência** e **Backpressure Adaptativo**. Além disso, sistemas corporativos integrados precisam de flexibilidade para direcionar tópicos para diferentes brokers por meio de **Roteamento Híbrido**.

## Controlando Concorrência com Semáforos e Backpressure

A gem **SharedBroker** implementa um semáforo thread-safe puro em Ruby para limitar a contagem máxima de tarefas simultâneas sob execução. 

Ao mesmo tempo, ela expõe uma checagem de saúde dinâmica (**Backpressure Check**). Se a validação retornar `true` (indicando que a CPU da máquina ou a latência do banco de dados local atingiu limites perigosos), o limitador pausa a busca de novos eventos temporariamente, liberando a máquina para processar o backlog atual:

```ruby
module SharedBroker
  module Concurrency
    class Limiter
      def initialize(max_concurrency: 5, backpressure_check: nil, backpressure_backoff: 2.0)
        @max_concurrency = max_concurrency
        @backpressure_check = backpressure_check
        @backpressure_backoff = backpressure_backoff
        @semaphore = Thread::Queue.new # Semáforo concorrente em Ruby
        @max_concurrency.times { @semaphore.push(:token) }
      end

      def execute
        # 1. Verifica se há sinais de sobrecarga sistêmica (Backpressure)
        if @backpressure_check&.call
          sleep(@backpressure_backoff)
          return false
        end

        # 2. Captura token do semáforo para controle de concorrência
        token = @semaphore.pop
        Thread.new do
          begin
            yield
          ensure
            # Restitui o token para liberar novas execuções
            @semaphore.push(token)
          end
        end
        true
      end
    end
  end
end
```

## Roteamento Híbrido de Tópicos (Multi-Adapter Routing)

Sistemas legados e modernos costumam conviver com diferentes brokers na infraestrutura. A gem permite que a aplicação direcione mensagens para destinos específicos definindo uma tabela de roteamento baseada em padrões de correspondência de strings (Wildcards / Globs):

```ruby
# Tabela de roteamento de eventos da Gem
routing_table = {
  "payment.processed" => :rabbitmq,
  "telemetry.*"       => :kafka,
  "cache.*"           => :redis,
  "*"                 => :rabbitmq # fallback
}

# Escolha dinâmica do adaptador conforme correspondência do padrão
def select_adapter(topic, routing_table, adapters)
  match = routing_table.keys.find { |pattern| File.fnmatch?(pattern, topic) }
  adapter_key = routing_table[match] || :rabbitmq
  adapters[adapter_key]
end
```

Com essa arquitetura, a gem encapsula toda a complexidade de rede de múltiplos destinos, oferecendo uma experiência simples e unificada para o desenvolvedor de domínio.

### Termos Técnicos Desmistificados
- **Backpressure (Contrapressão):** Mecanismo de defesa onde um consumidor sinaliza ao produtor/broker para diminuir ou interromper o envio de cargas de trabalho para evitar sobrecargas.
- **Semaphore (Semáforo):** Uma estrutura de controle de concorrência usada para limitar o acesso a um recurso compartilhado por múltiplos fluxos de execução.
- **Glob Pattern:** Padrões de formatação simplificados para busca e correspondência de nomes usando curingas (como asteriscos `*` e pontos de interrogação `?`).
---
