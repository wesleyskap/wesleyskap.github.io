---
title: "Mensageria confiável:Garantindo at-least-once com transactional outbox pattern"
excerpt: "Como garantir que um evento seja enviado ao broker de mensageria apenas se a transação do banco de dados for bem-sucedida? Conheça o padrão Transactional Outbox."
category: "Mensageria"
date: "12 de Abril, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O dilema da transação distribuída de duas fases

Imagine a seguinte situação clássica em microsserviços: o seu serviço de pagamentos conclui um pagamento e salva esse registro no banco de dados local. Em seguida, ele publica um evento `PaymentApprovedEvent` no seu broker de mensageria para alertar o serviço de envio.

O que acontece se a escrita no banco de dados falhar, mas a mensagem já tiver sido publicada? O cliente não pagou, mas o produto será enviado. E se a escrita no banco funcionar, mas a rede cair antes de enviar a mensagem ao broker? O cliente pagará, mas o produto nunca será despachado.

O padrão **Transactional Outbox** resolve este dilema de consistência de dados garantindo a entrega do tipo **At-Least-Once (Pelo menos uma vez)**.

## O design do outbox pattern

Em vez de publicar o evento diretamente para o broker, salvamos a mensagem em uma tabela especial chamada `outbox` no próprio banco de dados, utilizando a **mesma transação de banco de dados** que grava os dados de negócio. No ecossistema .NET, isso é resolvido usando o `DbContext` do Entity Framework Core dentro de uma transação atômica:

```csharp
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Onkai.EventBus.Abstractions;

public sealed class OrderService
{
    private readonly DbContext _dbContext;
    private readonly IOutboxStore _outboxStore;

    public OrderService(DbContext dbContext, IOutboxStore outboxStore)
    {
        _dbContext = dbContext;
        _outboxStore = outboxStore;
    }

    public async Task CreateOrderAsync(Guid orderId, decimal amount, CancellationToken token)
    {
        // Executa tanto a gravação de negócio quanto a do outbox na mesma transação atômica
        using var transaction = await _dbContext.Database.BeginTransactionAsync(token);
        try
        {
            // 1. Grava os dados de negócio
            var order = new Order { Id = orderId, Amount = amount };
            _dbContext.Add(order);
            await _dbContext.SaveChangesAsync(token);

            // 2. Serializa e insere na tabela outbox usando a mesma transação via IOutboxStore
            var orderEvent = new OrderCreatedEvent(orderId, amount);
            await _outboxStore.SaveMessageAsync(orderEvent, token);

            // Confirma a transação. Se falhar, reverte tudo.
            await transaction.CommitAsync(token);
        }
        catch
        {
            await transaction.RollbackAsync(token);
            throw;
        }
    }
}
```

## O processador do outbox (relay)

Um serviço em segundo plano (`OutboxProcessor`) busca periodicamente as mensagens não publicadas do banco de dados, tenta enviá-las ao broker através do `IMessageTransport` e as marca como publicadas após receber a confirmação:

```csharp
using Microsoft.Extensions.Hosting;
using Onkai.EventBus.Core.Transport;

public sealed class OutboxProcessor : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;

    public OutboxProcessor(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _serviceProvider.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<IOutboxStore>();
            var transport = scope.ServiceProvider.GetRequiredService<IMessageTransport>();

            var pendingMessages = await store.GetUnpublishedMessagesAsync(stoppingToken);
            foreach (var message in pendingMessages)
            {
                var envelope = new TransportEnvelope
                {
                    EventId = message.EventId,
                    EventName = message.EventName,
                    Body = message.Body,
                    CorrelationId = message.CorrelationId
                };

                // Publica no broker
                await transport.SendAsync(envelope, stoppingToken);

                // Atualiza o estado da mensagem no banco local
                await store.MarkAsPublishedAsync(message.Id, stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}
```

### Termos técnicos desmistificados
- **At-Least-Once Delivery:** Garantia de que todas as mensagens serão entregues ao seu destino pelo menos uma vez, aceitando a possibilidade de duplicidades.
- **Transação de Banco de Dados:** Conjunto de operações executadas como uma única unidade lógica e atômica de trabalho (tudo ou nada).
- **Outbox Relay:** O componente responsável por ler a tabela do banco de dados e repassar a informação de forma confiável para a rede.

