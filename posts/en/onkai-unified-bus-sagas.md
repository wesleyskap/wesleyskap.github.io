---
title: "Distributed transactions with sagas:Orchestrating steps and compensations"
excerpt: "Distributed microservices lack unified database transactions. Learn how to use the Saga pattern to coordinate complex operations and compensation steps."
category: "Messaging"
date: "Apr 18, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 11
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## Distributed transactions in microservices

In a monolithic application, maintaining data consistency is straightforward: open a database transaction, modify the tables, and commit the changes. If any step fails, the database rolls back everything.

However, in a microservices architecture, each service owns its database. We cannot execute a single database transaction across the Order service, Inventory service, and Billing service.

To maintain consistency across multiple microservice boundaries without slow distributed locks (like two-phase commits - 2PC), we implement the **Orchestrated Saga** pattern.

## The saga pattern and compensations

A Saga is a sequence of local transactions executed by individual microservices. If a local transaction fails, the orchestrator triggers **Compensation** transactions in reverse order to undo the side effects of previous steps. Here is how `SagaOrchestrator<TState>` is built in `onkai-unified-bus`:

```csharp
using System.Collections.Concurrent;
using Onkai.EventBus.Abstractions;

namespace Onkai.EventBus.Core.Sagas;

public sealed class SagaOrchestrator<TState>
    where TState : class, new()
{
    private readonly ISagaStateStore<TState> _store;
    private readonly ConcurrentDictionary<string, Func<SagaContext<TState>, CancellationToken, Task>> _compensations = new();

    public SagaOrchestrator(ISagaStateStore<TState> store)
    {
        _store = store;
    }

    // Registers a compensation callback for a given step name
    public void RegisterCompensation(string stepName, Func<SagaContext<TState>, CancellationToken, Task> compensation)
    {
        _compensations[stepName] = compensation;
    }
}
```

## Running saga steps safely

As business steps execute, the orchestrator updates the saga state persistently. If a step fails, the orchestrator automatically triggers the rollback flow, invoking registered compensations in reverse chronological order:

```csharp
public async Task ExecuteStepAsync<TEvent>(
    string sagaId,
    TEvent @event,
    Func<SagaContext<TState>, TEvent, CancellationToken, Task> stepAction,
    CancellationToken cancellationToken)
    where TEvent : IEvent
{
    var context = await _store.GetAsync(sagaId, cancellationToken) ?? new SagaContext<TState> { SagaId = sagaId };

    if (context.Status is "Failed" or "Compensated")
    {
        return;
    }

    try
    {
        await stepAction(context, @event, cancellationToken);
        context.CompletedSteps.Add(typeof(TEvent).Name);
        await _store.SaveAsync(context, cancellationToken);
    }
    catch
    {
        await RollbackSagaAsync(context, typeof(TEvent).Name, cancellationToken);
    }
}

private async Task RollbackSagaAsync(SagaContext<TState> context, string failingStep, CancellationToken cancellationToken)
{
    context.Status = "Failed";
    await _store.SaveAsync(context, cancellationToken);

    // Compensate the failing step and all previously completed steps
    await CompensateStepAsync(context, failingStep, cancellationToken);
    for (var i = context.CompletedSteps.Count - 1; i >= 0; i--)
    {
        var completedStep = context.CompletedSteps[i];
        await CompensateStepAsync(context, completedStep, cancellationToken);
    }

    context.Status = "Compensated";
    await _store.SaveAsync(context, cancellationToken);
}
```

### Technical terms demystified
- **Saga Pattern:** A design pattern to coordinate distributed local transactions using structured compensations to restore consistency.
- **Compensation:** A logical transaction that rolls back or undoes the changes made by a previously successful operation.
- **Saga State Store:** A persistent or in-memory database that tracks the active steps and context of ongoing sagas.

