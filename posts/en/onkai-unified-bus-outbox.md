---
title: "Reliable messaging:Guaranteeing at-least-once with transactional outbox pattern"
excerpt: "How do you guarantee that an event is sent to the message broker only if the database transaction succeeds? Learn about the Transactional Outbox pattern."
category: "Messaging"
date: "Apr 12, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## The two-phase distributed transaction dilemma

Consider this classic microservice scenario: your payment service completes a payment and saves the record in its local database. Next, it publishes a `PaymentApprovedEvent` to your message broker to notify the shipping service.

What happens if the database write fails but the message is already published? The customer didn't pay, but the product will be shipped. And what if the database write succeeds, but the network drops before publishing the message to the broker? The customer paid, but the product will never be dispatched.

The **Transactional Outbox** pattern resolves this data consistency dilemma, ensuring **At-Least-Once** message delivery.

## Outbox pattern design

Instead of publishing the event directly to the broker, we save the message in a special table called `outbox` within the same database, using the **same database transaction** that writes the business data. In .NET, this is naturally achieved using Entity Framework Core's `DbContext` within a transaction scope:

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
        // Execute both business write and outbox write inside the same atomic database transaction
        using var transaction = await _dbContext.Database.BeginTransactionAsync(token);
        try
        {
            // 1. Writes business data
            var order = new Order { Id = orderId, Amount = amount };
            _dbContext.Add(order);
            await _dbContext.SaveChangesAsync(token);

            // 2. Serializes and registers event in the outbox table via the outbox store within the transaction
            var orderEvent = new OrderCreatedEvent(orderId, amount);
            await _outboxStore.SaveMessageAsync(orderEvent, token);

            // Commits the transaction. If it fails, everything is rolled back.
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

## The outbox processor (relay)

A background hosted service (`OutboxProcessor`) periodically polls unpublished messages from the outbox store, attempts to publish them to the broker transport, and marks them as published upon receiving confirmations (ACKs):

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

                // Publishes the envelope to the broker
                await transport.SendAsync(envelope, stoppingToken);

                // Updates status in the outbox table
                await store.MarkAsPublishedAsync(message.Id, stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}
```

### Technical terms demystified
- **At-Least-Once Delivery:** A guarantee that all messages will be delivered to their destination at least once, accepting the possibility of duplicates.
- **Database Transaction:** A set of operations executed as a single, atomic logical unit of work (all or nothing).
- **Outbox Relay:** The component responsible for reading the database outbox table and reliably publishing the records to the network.

