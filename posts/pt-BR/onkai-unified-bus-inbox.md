---
title: "Evitando processamento duplicado:O inbox pattern e a idempotência de consumo"
excerpt: "Mensagens duplicadas são inevitáveis em sistemas distribuídos. Aprenda a implementar o Inbox Pattern para garantir a idempotência no consumo de eventos."
category: "Mensageria"
date: "15 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 9
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O problema da entrega pelo menos uma vez (at-least-once)

Em sistemas distribuídos de alta escala, garantir que uma mensagem seja entregue exatamente uma vez (**Exactly-Once**) é um problema extremamente complexo e ineficiente de resolver em nível de rede. Por esse motivo, quase todos os brokers (como RabbitMQ e Kafka) garantem a entrega **Pelo Menos Uma Vez (At-Least-Once)**.

Isso significa que, sob instabilidade de rede ou reinicializações de servidores, o mesmo evento pode ser entregue ao seu consumidor mais de uma vez. Se o seu consumidor processar essa mensagem duplicada (por exemplo, aprovar um pagamento ou deduzir um saldo), seu sistema sofrerá de inconsistência financeira ou lógica grave.

Para garantir que cada evento seja processado estritamente uma vez, implementamos o **Inbox Pattern**.

## O padrão inbox

O Inbox Pattern armazena os IDs de todas as mensagens processadas com sucesso em um repositório transacional persistente. Antes de iniciar qualquer processamento lógico do evento, o consumidor verifica se o ID da mensagem já existe nessa tabela de histórico (`inbox`):

```go
package main

import (
	"context"
	"database/sql"
	"errors"
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

## Consumo idempotente transacional

Acoplamos a lógica de validação do Inbox à mesma transação de banco de dados que executa a lógica de negócios da sua aplicação. Se a mensagem já existia, o fluxo é encerrado sem executar a lógica repetidamente:

```go
func (c *OrderCompletedConsumer) Consume(ctx context.Context, msg Message) error {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Verifica duplicidade usando o InboxStore na transação
	alreadyProcessed, err := c.inboxStore.HasProcessed(ctx, msg.ID)
	if err != nil || alreadyProcessed {
		// Mensagem já processada! Aborta sem estourar erros (Silent Ignore)
		return nil
	}

	// 2. Executa a lógica de negócios
	err = c.executeOrderBusinessLogic(tx, msg.Payload)
	if err != nil {
		return err
	}

	// 3. Marca a mensagem como processada no Inbox
	err = c.inboxStore.MarkAsProcessed(ctx, msg.ID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
```

### Termos técnicos desmistificados
- **Idempotência:** A propriedade de algumas operações em matemática e ciência da computação que podem ser aplicadas mais de uma vez sem alterar o resultado final.
- **Inbox Pattern:** Padrão que recebe e registra mensagens em uma fila/tabela de recebimento antes do processamento final para filtrar duplicidades.
- **Silent Ignore:** Ação de descartar requisições repetidas sem retornar mensagens de falha, evitando reprocessamentos ou loops de erro indesejados.
