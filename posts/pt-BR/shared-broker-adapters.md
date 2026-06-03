---
title: "Desacoplamento de Mensageria em Ruby: Implementando o Adapter Pattern com InMemory, RabbitMQ, Kafka e Redis"
excerpt: "Como desacoplar o envio e consumo de mensagens do broker físico em aplicações Ruby? Aprenda a projetar e utilizar múltiplos adaptadores."
category: "Mensageria"
date: "25 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## O Problema do Acoplamento de Rede nos Testes e na Produção

Ao desenvolver aplicações em trilhos (*Rails*) ou microsserviços em Ruby orientados a eventos, as equipes costumam instanciar conexões com filas usando clientes físicos (como o SDK do RabbitMQ `bunny` ou o cliente `kafka`) diretamente nos controladores de rotas ou serviços de domínio.

Isso cria dois gargalos estruturais imediatos:
1. **Testes Lentos e Dependentes:** Para executar a suíte de testes de unidade locais (TDD), os desenvolvedores são forçados a subir instâncias físicas de brokers via Docker ou mockar exaustivamente chamadas de rede com stubs complexos (`WebMock`/`allow()`).
2. **Dificuldade de Chaveamento:** Migrar de um broker simples como Redis Pub/Sub para um barramento robusto como Kafka exige refatorar múltiplos locais de disparo de código de domínio da aplicação.

A Gem **SharedBroker** resolve este acoplamento implementando o **Adapter Pattern (Padrão de Adaptadores)**.

## Definindo a Interface de Adaptadores em Ruby

A base do desacoplamento consiste em definir uma interface comum que todos os adaptadores concretos precisam respeitar. Em Ruby, embora não existam interfaces nativas em nível de linguagem, impomos contratos estruturando uma classe base abstrata que lança erros de implementação pendente:

```ruby
module SharedBroker
  module Adapters
    class Base
      def connect
        raise NotImplementedError, "#{self.class} deve implementar #connect"
      end

      def publish(topic, payload)
        raise NotImplementedError, "#{self.class} deve implementar #publish"
      end

      def subscribe(topic, queue_name, &block)
        raise NotImplementedError, "#{self.class} deve implementar #subscribe"
      end

      def close
        raise NotImplementedError, "#{self.class} deve implementar #close"
      end
    end
  end
end
```

## O Adaptador InMemory: Acelerando Testes (TDD)

O adaptador `InMemory` é a chave para a velocidade nos testes locais. Ele simula o ciclo de vida de publicação e escuta mantendo as chamadas na memória principal do processo de execução, descartando a necessidade de filas externas nos testes de unidade:

```ruby
module SharedBroker
  module Adapters
    class InMemory < Base
      def initialize
        @topics = Hash.new { |h, k| h[k] = [] }
      end

      def connect
        # Simulação síncrona instantânea
        true
      end

      def publish(topic, payload)
        # Executa sincronamente todos os blocos ouvintes registrados
        @topics[topic].each { |callback| callback.call(payload) }
      end

      def subscribe(topic, queue_name, &block)
        @topics[topic] << block
      end

      def close
        @topics.clear
      end
    end
  end
end
```

## Adaptadores Físicos de Produção (RabbitMQ e Redis)

Para ambientes de produção, injetamos adaptadores reais que traduzem a chamada comum para APIs específicas de seus respectivos gems:
- **`RabbitMQ` (Bunny):** Controla a conexão física à exchange e roteia mensagens.
- **`Redis` (Redis Pub/Sub):** Executa comandos `publish` e mantém loops de escuta usando canais na memória.

Com esta infraestrutura montada, a aplicação simplesmente interage com o cliente central (`SharedBroker::Client.new(adapter: BROKER_ADAPTER)`), desacoplando a lógica de negócio do transporte físico.

### Termos Técnicos Desmistificados
- **Adapter Pattern:** Padrão estrutural que permite que objetos com interfaces incompatíveis colaborem por meio de uma classe adaptadora comum.
- **TDD (Test-Driven Development):** Prática de desenvolvimento onde escrevemos os testes de comportamento antes do código de produção correspondente.
- **Abstract Class:** Classe projetada para ser herdada por outras classes, mas que não deve ser instanciada diretamente.
