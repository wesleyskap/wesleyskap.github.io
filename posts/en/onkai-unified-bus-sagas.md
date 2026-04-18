---
title: "Distributed Transactions with Sagas: Orchestrating Steps and Compensations"
excerpt: "Distributed microservices lack unified database transactions. Learn how to use the Saga pattern to coordinate complex operations and compensation steps."
category: "Messaging"
date: "Apr 18, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 11
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## Distributed Transactions in Microservices

In a monolithic application, maintaining data consistency is straightforward: open a database transaction, modify the tables, and commit the changes. If any step fails, the database rolls back everything.

However, in a microservices architecture, each service owns its database. We cannot execute a single database transaction across the Order service, Inventory service, and Billing service.

To maintain consistency across multiple microservice boundaries without slow distributed locks (like two-phase commits - 2PC), we implement the **Orchestrated Saga** pattern.

## The Saga Pattern and Compensations

A Saga is a sequence of local transactions executed by individual microservices. If a local transaction fails, the orchestrator triggers **Compensation** transactions in reverse order to undo the side effects of previous steps:

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

// RegisterCompensation registers a fallback function for a completed step
func (o *SagaOrchestrator) RegisterCompensation(step string, comp func(ctx context.Context, state *SagaState) error) {
	o.compensations[step] = comp
}

// Rollback executes registered compensations in reverse order upon failure
func (o *SagaOrchestrator) Rollback(ctx context.Context, state *SagaState) {
	log.Printf("[Saga] Starting Rollback for Saga: %s", state.SagaID)
	
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

## Running Saga Steps Safely

As business steps execute, the orchestrator updates the saga state persistently. If the Billing step fails, the orchestrator triggers the rollback flow, releasing reserved stock:

```go
func (o *SagaOrchestrator) ExecuteSaga(ctx context.Context, state *SagaState) error {
	// Step 1: Reserve Stock
	err := o.reserveStock(ctx, state)
	if err != nil {
		o.Rollback(ctx, state)
		return err
	}
	state.StockReserved = true

	// Step 2: Process Payment
	err = o.processPayment(ctx, state)
	if err != nil {
		o.Rollback(ctx, state)
		return fmt.Errorf("payment failed: %w", err)
	}
	state.PaymentDone = true

	return nil
}

func (o *SagaOrchestrator) reserveStock(ctx context.Context, state *SagaState) error {
	log.Println("[Saga] Stock reserved successfully.")
	return nil
}

func (o *SagaOrchestrator) processPayment(ctx context.Context, state *SagaState) error {
	// Simulates payment failure
	return fmt.Errorf("insufficient funds")
}
```

### Technical Terms Demystified
- **Saga Pattern:** A design pattern to coordinate distributed local transactions using structured compensations to restore consistency.
- **Compensation:** A logical transaction that rolls back or undoes the changes made by a previously successful operation.
- **Saga State Store:** A persistent or in-memory database that tracks the active steps and context of ongoing sagas.
---
