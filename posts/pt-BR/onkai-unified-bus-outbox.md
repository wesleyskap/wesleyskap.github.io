---
title: "Mensageria Confiável: Garantindo At-Least-Once com Transactional Outbox Pattern"
excerpt: "Como garantir que um evento seja enviado ao broker de mensageria apenas se a transação do banco de dados for bem-sucedida? Conheça o padrão Transactional Outbox."
category: "Mensageria"
date: "12 de Abril, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## O Dilema da Transação Distribuída de Duas Fases

Imagine a seguinte situação clássica em microsserviços: o seu serviço de pagamentos conclui um pagamento e salva esse registro no banco de dados local. Em seguida, ele publica um evento `PaymentApprovedEvent` no seu broker de mensageria para alertar o serviço de envio.

O que acontece se a escrita no banco de dados falhar, mas a mensagem já tiver sido publicada? O cliente não pagou, mas o produto será enviado. E se a escrita no banco funcionar, mas a rede cair antes de enviar a mensagem ao broker? O cliente pagará, mas o produto nunca será despachado.

O padrão **Transactional Outbox** resolve este dilema de consistência de dados garantindo a entrega do tipo **At-Least-Once (Pelo menos uma vez)**.

## O Design do Outbox Pattern

Em vez de publicar o evento diretamente para o broker, salvamos a mensagem em uma tabela especial chamada `outbox` no próprio banco de dados, utilizando a **mesma transação de banco de dados** que grava os dados de negócio:

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

// CreateOrder cria o pedido e a mensagem de outbox de forma transacional
func (s *OrderService) CreateOrder(ctx context.Context, orderID string, amount float64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Grava os dados de negócio na tabela de pedidos
	_, err = tx.ExecContext(ctx, "INSERT INTO orders (id, amount) VALUES (?, ?)", orderID, amount)
	if err != nil {
		return err
	}

	// 2. Serializa o evento de negócio
	eventPayload, _ := json.Marshal(map[string]interface{}{"order_id": orderID, "amount": amount})

	// 3. Grava o evento na tabela de outbox usando a mesma transação
	_, err = tx.ExecContext(ctx, 
		"INSERT INTO outbox (id, topic, payload, created_at, processed) VALUES (?, ?, ?, ?, ?)",
		orderID, "orders.created", eventPayload, time.Now(), false,
	)
	if err != nil {
		return err
	}

	// Finaliza a transação atômica. Se falhar, reverte tudo.
	return tx.Commit()
}
```

## O Processador do Outbox (Relay)

Uma goroutine em segundo plano (Outbox Processor) busca periodicamente as mensagens não processadas da tabela `outbox`, tenta enviá-las ao broker e as marca como processadas após receber a confirmação de recebimento (ACK):

```go
func (s *OutboxProcessor) ProcessPendingMessages(ctx context.Context) {
	// Busca mensagens pendentes no banco
	messages := s.fetchPendingFromOutbox(ctx)

	for _, msg := range messages {
		// Publica no broker
		err := s.driver.Publish(ctx, msg.Topic, Message{
			ID:      msg.ID,
			Payload: msg.Payload,
		})

		if err == nil {
			// Atualiza no banco de dados local
			s.markAsProcessed(ctx, msg.ID)
		}
	}
}
```

### Termos Técnicos Desmistificados
- **At-Least-Once Delivery:** Garantia de que todas as mensagens serão entregues ao seu destino pelo menos uma vez, aceitando a possibilidade de duplicidades.
- **Transação de Banco de Dados:** Conjunto de operações executadas como uma única unidade lógica e atômica de trabalho (tudo ou nada).
- **Outbox Relay:** O componente responsável por ler a tabela do banco de dados e repassar a informação de forma confiável para a rede.
