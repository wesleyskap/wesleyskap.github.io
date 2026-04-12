---
title: "Reliable Messaging: Guaranteeing At-Least-Once with Transactional Outbox Pattern"
excerpt: "How do you guarantee that an event is sent to the message broker only if the database transaction succeeds? Learn about the Transactional Outbox pattern."
category: "Messaging"
date: "Apr 12, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## The Two-Phase Distributed Transaction Dilemma

Consider this classic microservice scenario: your payment service completes a payment and saves the record in its local database. Next, it publishes a `PaymentApprovedEvent` to your message broker to notify the shipping service.

What happens if the database write fails but the message is already published? The customer didn't pay, but the product will be shipped. And what if the database write succeeds, but the network drops before publishing the message to the broker? The customer paid, but the product will never be dispatched.

The **Transactional Outbox** pattern resolves this data consistency dilemma, ensuring **At-Least-Once** message delivery.

## Outbox Pattern Design

Instead of publishing the event directly to the broker, we save the message in a special table called `outbox` within the same database, using the **same database transaction** that writes the business data:

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type OutboxMessage struct {
	ID        string
	Topic     string
	Payload   []byte
	CreatedAt time.Time
	Processed bool
}

type OrderService struct {
	db *sql.DB
}

// CreateOrder creates the order and the outbox message transactionally
func (s *OrderService) CreateOrder(ctx context.Context, orderID string, amount float64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Writes business data to the orders table
	_, err = tx.ExecContext(ctx, "INSERT INTO orders (id, amount) VALUES (?, ?)", orderID, amount)
	if err != nil {
		return err
	}

	// 2. Serializes the business event
	eventPayload, _ := json.Marshal(map[string]interface{}{"order_id": orderID, "amount": amount})

	// 3. Writes the event to the outbox table within the same transaction
	_, err = tx.ExecContext(ctx, 
		"INSERT INTO outbox (id, topic, payload, created_at, processed) VALUES (?, ?, ?, ?, ?)",
		orderID, "orders.created", eventPayload, time.Now(), false,
	)
	if err != nil {
		return err
	}

	// Commits the atomic transaction. If it fails, everything is rolled back.
	return tx.Commit()
}
```

## The Outbox Processor (Relay)

A background goroutine (Outbox Processor) periodically polls unprocessed messages from the `outbox` table, attempts to publish them to the broker, and marks them as processed upon receiving publisher confirmations (ACKs):

```go
func (s *OutboxProcessor) ProcessPendingMessages(ctx context.Context) {
	// Fetches pending messages from the local database
	messages := s.fetchPendingFromOutbox(ctx)

	for _, msg := range messages {
		// Publishes to the broker
		err := s.driver.Publish(ctx, msg.Topic, Message{
			ID:      msg.ID,
			Payload: msg.Payload,
		})

		if err == nil {
			// Updates the state in the local database
			s.markAsProcessed(ctx, msg.ID)
		}
	}
}
```

### Technical Terms Demystified
- **At-Least-Once Delivery:** A guarantee that all messages will be delivered to their destination at least once, accepting the possibility of duplicates.
- **Database Transaction:** A set of operations executed as a single, atomic logical unit of work (all or nothing).
- **Outbox Relay:** The component responsible for reading the database outbox table and reliably publishing the records to the network.
---
