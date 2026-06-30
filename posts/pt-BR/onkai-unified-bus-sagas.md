---
title: "Transações distribuídas com sagas:Orquestrando processos e compensações com sucesso"
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

Uma Saga é uma sequência de transações locais executadas por microsserviços individuais. Se uma transação local falhar, o orquestrador assume a responsabilidade de executar transações de **Compensação** em ordem inversa para desfazer os efeitos colaterais anteriores:

```go
package main

import (
	"context"
	"fmt"
	"log"
)

type SagaState struct {
	SagaID        string
	CurrentStep   string
	StockReserved bool
	PaymentDone   bool
}

type SagaOrchestrator struct {
	compensations map[string]func(ctx context.Context, state *SagaState) error
}

func NewSagaOrchestrator() *SagaOrchestrator {
	return &SagaOrchestrator{
		compensations: make(map[string]func(ctx context.Context, state *SagaState) error),
	}
}

// RegisterCompensation mapeia a ação de reversão para cada etapa concluída
func (o *SagaOrchestrator) RegisterCompensation(step string, comp func(ctx context.Context, state *SagaState) error) {
	o.compensations[step] = comp
}

// Rollback executa as ações de compensação registradas em caso de erro
func (o *SagaOrchestrator) Rollback(ctx context.Context, state *SagaState) {
	log.Printf("[Saga] Iniciando Rollback para a Saga: %s", state.SagaID)
	
	// Executa compensações para ações já finalizadas
	if state.PaymentDone {
		if comp, exists := o.compensations["Payment"]; exists {
			_ = comp(ctx, state)
		}
	}
	if state.StockReserved {
		if comp, exists := o.compensations["Stock"]; exists {
			_ = comp(ctx, state)
		}
	}
}
```

## Executando etapas de forma segura

Durante o processamento das etapas de negócio, o orquestrador atualiza o estado persistentemente. Se a etapa de Faturamento falhar, o orquestrador dispara o fluxo de `Rollback` garantindo que os estoques reservados sejam liberados graciosamente:

```go
func (o *SagaOrchestrator) ExecuteSaga(ctx context.Context, state *SagaState) error {
	// Passo 1: Reservar Estoque
	err := o.reserveStock(ctx, state)
	if err != nil {
		o.Rollback(ctx, state)
		return err
	}
	state.StockReserved = true

	// Passo 2: Processar Pagamento
	err = o.processPayment(ctx, state)
	if err != nil {
		o.Rollback(ctx, state)
		return fmt.Errorf("falha no pagamento: %w", err)
	}
	state.PaymentDone = true

	return nil
}

func (o *SagaOrchestrator) reserveStock(ctx context.Context, state *SagaState) error {
	log.Println("[Saga] Estoque reservado com sucesso.")
	return nil
}

func (o *SagaOrchestrator) processPayment(ctx context.Context, state *SagaState) error {
	// Simula uma falha inesperada no pagamento
	return fmt.Errorf("saldo insuficiente")
}
```

### Termos técnicos desmistificados
- **Saga Pattern:** Padrão de design para coordenar transações locais distribuídas que utilizam compensações estruturadas para restaurar a consistência do sistema.
- **Compensação:** Uma transação lógica que desfaz as alterações criadas por uma operação bem-sucedida executada anteriormente.
- **Saga State Store:** Banco de dados estruturado ou em memória responsável por guardar as etapas atuais e variáveis contextuais de execuções de Sagas ativas.
