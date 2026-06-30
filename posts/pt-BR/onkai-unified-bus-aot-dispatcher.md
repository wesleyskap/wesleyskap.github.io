---
title: "Dispatcher sem reflexão:Otimizando performance e suportando compilação native AOT"
excerpt: "A reflexão dinâmica degrada a performance do Garbage Collector e quebra compilações nativas AOT. Veja como projetamos um roteador livre de reflexão em C#."
category: "Mensageria"
date: "16 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 10
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## Os desafios do dispatch dinâmico e da compilação AOT

Em sistemas de mensageria tradicionais, quando um novo evento chega, o roteador do barramento precisa descobrir dinamicamente qual classe ou estrutura consome aquele tipo de mensagem. Na maioria das linguagens de programação, isso é feito em tempo de execução inspecionando tipos por meio de **Reflexão (Reflection)**.

Apesar de ser uma abordagem simples e flexível, a reflexão traz sérios problemas:
1. **Custo de Performance:** Inspecionar e invocar métodos dinamicamente aloca variáveis na memória *heap*, criando um gargalo constante para o coletor de lixo.
2. **Incompatibilidade com Native AOT (Ahead-of-Time):** Compiladores AOT removem códigos e metadados de reflexão não utilizados durante a compilação para gerar binários ultraleves. Chamar código via reflexão dinâmica falha ou gera erros misteriosos em produção porque o compilador não consegue rastrear chamadas dinâmicas.

O **onkai-unified-bus** resolve isso substituindo invocações dinâmicas por um despachante tipado estaticamente via cache concorrente de executores tipados.

## Roteamento de eventos baseado em executors tipados

Em vez de buscar o método de processamento do consumidor via reflexão a cada mensagem, o barramento registra objetos executores genéricos durante a inicialização da aplicação. O despachante delega o fluxo por meio de interfaces estáticas:

```csharp
using Onkai.EventBus.Abstractions;

namespace Onkai.EventBus.Core.Subscription;

// Define um contrato para despachar eventos para consumidores sem usar reflexão
internal interface IEventConsumerExecutor
{
    Task ExecuteAsync(object consumer, IEvent @event, ConsumeContext context, CancellationToken cancellationToken);
}

// Classe genérica que realiza o cast estático rápido evitando reflexão
internal sealed class EventConsumerExecutor<TEvent> : IEventConsumerExecutor
    where TEvent : IEvent
{
    public Task ExecuteAsync(object consumer, IEvent @event, ConsumeContext context, CancellationToken cancellationToken)
    {
        if (consumer == null) throw new ArgumentNullException(nameof(consumer));
        if (@event == null) throw new ArgumentNullException(nameof(@event));

        var typedConsumer = (IEventConsumer<TEvent>)consumer;
        var typedEvent = (TEvent)@event;

        return typedConsumer.ConsumeAsync(typedEvent, context, cancellationToken);
    }
}
```

## O despachante livre de reflexão

No recebimento da mensagem, o despachante localiza o executor estático em um dicionário concorrente (`ConcurrentDictionary`) indexado pelo tipo do evento, realizando uma chamada direta de interface em poucos nanossegundos:

```csharp
using System.Collections.Concurrent;
using Onkai.EventBus.Abstractions;

public sealed class RabbitMqConsumer
{
    private readonly ConcurrentDictionary<Type, IEventConsumerExecutor> _executors = new();

    private async Task ExecuteConsumerAsync(Type eventType, object consumerInstance, IEvent eventData, ConsumeContext context, CancellationToken token)
    {
        // Obtém ou insere no cache o executor tipado pré-compilado sem usar reflexão na invocação
        var executor = _executors.GetOrAdd(eventType, t =>
        {
            var executorType = typeof(EventConsumerExecutor<>).MakeGenericType(t);
            return (IEventConsumerExecutor)Activator.CreateInstance(executorType)!;
        });

        await executor.ExecuteAsync(consumerInstance, eventData, context, token);
    }
}
```

### Termos técnicos desmistificados
- **Native AOT (Ahead-of-Time):** Tecnologia de compilação que converte código-fonte diretamente em código de máquina nativo da plataforma alvo no momento do build, dispensando interpretadores ou compiladores JIT.
- **Reflection-free Dispatcher:** Padrão de design de roteadores que utiliza interfaces estáticas ou lambdas gerados no build para chamar funções sem inspecionar a estrutura de objetos em tempo de execução.
- **Type Casting:** Conversão explícita de uma interface ou variável genérica para o seu tipo estrutural original ou específico em Go/C#.

