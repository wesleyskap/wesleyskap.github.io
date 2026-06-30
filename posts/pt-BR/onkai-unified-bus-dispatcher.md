---
title: "Zero-allocation dispatcher: Roteando milhões de eventos sem alocações na heap em C#"
excerpt: "Como projetar um despachante de eventos concorrente de alta performance na memória? Descubra como o onkai-unified-bus usa ObjectPool e System.Threading.Channels para obter vazão massiva livre de Garbage Collector."
category: "Mensageria"
date: "17 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O gargalo das alocações dinâmicas em barramentos de alta vazão

Em arquiteturas orientadas a eventos de alta performance, cada microssegundo conta. Quando implementamos um barramento de eventos (Event Bus) local em .NET, o padrão mais comum é alocar novos recipientes de mensagens e encapsular delegates de forma dinâmica. Embora simples, essa abordagem gera um grande volume de objetos de curta duração na memória dinâmica *heap*. Como consequência, o coletor de lixo (Garbage Collector - GC) é ativado de forma agressiva, causando pausas de coleta de geração 0/1 que degradam o rendimento global do sistema.

Para resolver isso de forma elegante, o **onkai-unified-bus** adota uma estratégia de alocação de memória virtualmente nula (zero-allocation). Ao utilizar um motor de despacho estruturado de alto rendimento, ele processa eventos através de envelopes de mensagens internamente mantidos em pools e canais concorrentes, oferecendo aos desenvolvedores .NET a máxima vazão com o menor consumo de memória possível.

## Configurando o barramento de eventos

A biblioteca expõe uma API de registro fluente integrada com o sistema de injeção de dependências nativo do .NET. Por baixo dos panos, isso configura automaticamente os canais de transporte, recursos em pools e workers de segundo plano:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Onkai.EventBus.Core.Extensions;
using Onkai.EventBus.RabbitMQ.Extensions;

var builder = WebApplication.CreateBuilder(args);

// Registra o motor básico do barramento e o provedor RabbitMQ
builder.Services.AddEventBus()
                .UseRabbitMq(config =>
                {
                    config.HostName = "localhost";
                    config.UserName = "guest";
                    config.Password = "guest";
                });
```

## Publicação de eventos de alta velocidade

Após a configuração, basta injetar a interface thread-safe `IEventPublisher` nos seus serviços para disparar eventos. O framework se encarrega de obter um envelope reaproveitado do pool, serializar o payload do evento e agendar a entrega nas estruturas de canais otimizadas:

```csharp
using Onkai.EventBus.Abstractions;

public sealed class OrderService
{
    private readonly IEventPublisher _publisher;

    public OrderService(IEventPublisher publisher)
    {
        _publisher = publisher;
    }

    public async Task CheckoutAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var orderEvent = new OrderCreatedEvent(orderId, 199.99m, "customer@example.com");

        // Dispara o evento utilizando o motor de alta velocidade da biblioteca
        await _publisher.PublishAsync(orderEvent, cancellationToken: cancellationToken);
    }
}
```

### Termos técnicos desmistificados
- **Heap:** A área de memória do sistema onde os dados com ciclo de vida dinâmico são alocados em tempo de execução. O acesso e gerenciamento dela são mais custosos do que a pilha (Stack).
- **ObjectPool:** Um padrão de design e uma classe em .NET que armazena objetos temporários para reutilização futura, reduzindo alocações.
- **System.Threading.Channels:** APIs em .NET que fornecem uma fila produtor-consumidor concorrente de alto desempenho e alocação quase nula para arquiteturas assíncronas.


