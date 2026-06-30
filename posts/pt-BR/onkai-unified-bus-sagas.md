---
title: "Transações distribuídas com sagas:Orchestrando processos e compensações com sucesso"
excerpt: "Sistemas distribuídos não possuem transações de banco de dados unificadas. Aprenda a usar o padrão Saga para coordenar transações complexas e ações de compensação."
category: "Mensageria"
date: "18 de Abril, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 11
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## Transações distribuídas em microsserviços

Em uma aplicação monolítica, manter a consistência dos dados é simples: basta iniciar uma transação de banco de dados, realizar todas as alterações necessárias nas tabelas e confirmar (`commit`) as alterações. Se qualquer etapa falhar, o banco desfaz tudo (`rollback`).

No entanto, em uma arquitetura de microsserviços, cada serviço possui seu próprio banco de dados independente. Não podemos realizar uma transação única de banco entre o banco de Pedidos, o banco de Estoque e o banco de Faturamento.

Para manter a consistência de processos complexos que cruzam múltiplos limites de serviços sem depender de bloqueios de rede lentos (como transações de duas fases 2PC), implementamos o padrão **Saga Orquestrada**.

## O padrão saga e compensações

Uma Saga é uma sequência de transações locais executadas por microsserviços individuais. Se uma transação local falhar, o orquestrador assume a responsabilidade de executar transações de **Compensação** em ordem inversa para desfazer os efeitos colaterais anteriores. Veja como o `SagaOrchestrator<TState>` é modelado no `onkai-unified-bus`:

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

    // Registra a função de compensação para uma etapa específica
    public void RegisterCompensation(string stepName, Func<SagaContext<TState>, CancellationToken, Task> compensation)
    {
        _compensations[stepName] = compensation;
    }
}
```

## Executando etapas de forma segura

Durante o processamento das etapas de negócio, o orquestrador atualiza o estado persistentemente. Se uma etapa falhar, o fluxo de reversão é acionado, desfazendo as operações com sucesso na ordem inversa da execução:

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

    // Compensa a etapa com falha e todas as etapas concluídas anteriormente
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

### Termos técnicos desmistificados
- **Saga Pattern:** Padrão de design para coordenar transações locais distribuídas que utilizam compensações estruturadas para restaurar a consistência do sistema.
- **Compensação:** Uma transação lógica que desfaz as alterações criadas por uma operação bem-sucedida executada anteriormente.
- **Saga State Store:** Banco de dados estruturado ou em memória responsável por guardar as etapas atuais e variáveis contextuais de execuções de Sagas ativas.

