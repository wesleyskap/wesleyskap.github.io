---
title: "Resiliência em microsserviços Ruby:Retries com backoff exponencial, DLQ e circuit breaker thread-safe"
excerpt: "Sistemas falham. Aprenda a desenhar políticas automáticas de retry, desvios para Dead Letter Queue (DLQ) e Circuit Breaker na gem SharedBroker."
category: "Resiliência"
date: "26 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## Tolerância a falhas em sistemas de mensageria

Em arquiteturas distribuídas, a falha temporária de microsserviços integrados é uma certeza de produção: bancos de dados sob pico de carga, lentidão de rede e timeouts inesperados. Se um consumidor de mensagens falhar imediatamente diante de uma instabilidade passageira, perderemos transações de negócios vitais.

Para garantir que nenhuma mensagem seja perdida, a gem **SharedBroker** incorpora estratégias integradas de resiliência: **Retries com Backoff Exponencial**, **Roteamento de DLQ (Dead Letter Queue)** enriquecido com cabeçalhos de erros, e um **Circuit Breaker** thread-safe para chamadas de rede.

## Retries e backoff exponencial com DLQ fallback

Quando o processamento de uma mensagem falha, o consumidor realiza tentativas progressivas de reprocessamento. A duração do intervalo entre as tentativas aumenta exponencialmente (ex: $2^n$ segundos) para permitir o restabelecimento do serviço destino.

Se o limite máximo de tentativas for atingido sem sucesso, a mensagem é movida automaticamente para a **Dead Letter Queue (DLQ)** da fila correspondente, contendo metadados detalhados sobre a falha para fins de depuração:

```ruby
module SharedBroker
  class RetryRunner
    def initialize(max_retries: 3, backoff_base: 2)
      @max_retries = max_retries
      @backoff_base = backoff_base
    end

    def execute(message, dlq_handler)
      attempts = 0
      begin
        attempts += 1
        yield message
      rescue => e
        if attempts <= @max_retries
          # Calcula o atraso exponencial: base ^ tentativa
          delay = @backoff_base ** attempts
          sleep(delay)
          retry
        else
          # Se esgotar os retries, desvia para a DLQ com metadados de erro
          error_metadata = {
            failed_at: Time.now.to_s,
            exception_class: e.class.name,
            exception_message: e.message
          }
          dlq_handler.call(message, error_metadata)
        end
      end
    end
  end
end
```

## O circuit breaker thread-safe outbound

O `CircuitBreaker` protege o broker e os publicadores de eventos. Se o broker de destino (ex: RabbitMQ) estiver instável e a publicação começar a acumular timeouts repetidos, o circuito transiciona para o estado **OPEN** (Aberto). 

Enquanto aberto, as novas requisições falham instantaneamente (Fast-Fail), sem gerar bloqueios de conexões locais na memória do Rails.

```ruby
module SharedBroker
  class CircuitBreaker
    attr_reader :state

    def initialize(failure_threshold: 5, cooldown: 30)
      @failure_threshold = failure_threshold
      @cooldown = cooldown
      @failures = 0
      @state = :closed
      @last_failure_time = nil
      @mu = Mutex.new # Proteção concorrente thread-safe
    end

    def execute
      @mu.synchronize do
        check_cooldown
        raise "Circuit is OPEN - failing fast" if @state == :open
      end

      begin
        yield
        reset_failures
      rescue => e
        record_failure
        raise e
      end
    end

    private

    def record_failure
      @mu.synchronize do
        @failures += 1
        if @failures >= @failure_threshold
          @state = :open
          @last_failure_time = Time.now
        end
      end
    end

    def reset_failures
      @mu.synchronize do
        @failures = 0
        @state = :closed
      end
    end

    def check_cooldown
      if @state == :open && Time.now - @last_failure_time > @cooldown
        @state = :half_open
      end
    end
  end
end
```

### Termos técnicos desmistificados
- **Dead Letter Queue (DLQ):** Fila de descarte segura projetada para armazenar e expor mensagens com erros definitivos para auditorias humanas ou de sistemas.
- **Fast-Fail (Falha Rápida):** Comportamento de resiliência que recusa a execução de operações fadadas ao fracasso antes que consumam preciosas conexões de rede ou memória.
- **Mutex (Mutual Exclusion):** Trava utilizada em desenvolvimento concorrente (multi-threaded) para impedir race conditions durante a leitura e escrita de variáveis compartilhadas.
