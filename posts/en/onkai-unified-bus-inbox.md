---
title: "Avoiding Duplicate Processing: The Inbox Pattern and Idempotent Consumers"
excerpt: "Duplicate messages are inevitable in distributed systems. Learn how to implement the Inbox Pattern to guarantee idempotent event consumption."
category: "Messaging"
date: "Apr 15, 2026"
readTime: "5 min read"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 9
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## The At-Least-Once Delivery Problem

In high-scale distributed systems, guaranteeing that a message is delivered exactly once (**Exactly-Once**) is a highly complex and network-inefficient task. For this reason, most message brokers (like RabbitMQ and Kafka) guarantee **At-Least-Once** delivery.

This means that during network hiccups or server restarts, the same event may be delivered to your consumer more than once. If your consumer processes this duplicate message (for example, approving a payment again or deducting balance twice), it will cause severe data inconsistency.

To ensure each event is processed exactly once by the business logic, we implement the **Inbox Pattern**.

## The Inbox Pattern

The Inbox Pattern stores the IDs of all successfully processed messages in a persistent, transactional database table. Before initiating any business logic, the consumer checks if the incoming message ID already exists in the inbox history:

```go
package main

import (
	"context"
	"database/sql"
)

type InboxStore interface {
	HasProcessed(ctx context.Context, messageID string) (bool, error)
	MarkAsProcessed(ctx context.Context, messageID string) error
}

type SQLInboxStore struct {
	db *sql.DB
}

func (store *SQLInboxStore) HasProcessed(ctx context.Context, messageID string) (bool, error) {
	var exists bool
	query := "SELECT EXISTS(SELECT 1 FROM inbox_messages WHERE message_id = ?)"
	err := store.db.QueryRowContext(ctx, query, messageID).Scan(&exists)
	return exists, err
}

func (store *SQLInboxStore) MarkAsProcessed(ctx context.Context, messageID string) error {
	_, err := store.db.ExecContext(ctx, 
		"INSERT INTO inbox_messages (message_id, processed_at) VALUES (?, NOW())", 
		messageID,
	)
	return err
}
```

## Transactional Idempotent Consumption

We couple the Inbox verification and recording inside the same database transaction that executes the business logic. If the message is already present, the flow terminates gracefully without executing the business logic again:

```go
func (c *OrderCompletedConsumer) Consume(ctx context.Context, msg Message) error {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Checks duplicate state using the InboxStore within the transaction
	alreadyProcessed, err := c.inboxStore.HasProcessed(ctx, msg.ID)
	if err != nil || alreadyProcessed {
		// Already processed! Exit silently to avoid processing again
		return nil
	}

	// 2. Executes the core business logic
	err = c.executeOrderBusinessLogic(tx, msg.Payload)
	if err != nil {
		return err
	}

	// 3. Marks the message as processed in the Inbox
	err = c.inboxStore.MarkAsProcessed(ctx, msg.ID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
```

### Technical Terms Demystified
- **Idempotency:** The property of certain operations where they can be applied multiple times without changing the result beyond the initial application.
- **Inbox Pattern:** A pattern where incoming messages are logged into a local table/database to check and filter out duplicates before executing business logic.
- **Silent Ignore:** The practice of ignoring a duplicate request without returning a failure, avoiding unnecessary error logs or retries.
---
