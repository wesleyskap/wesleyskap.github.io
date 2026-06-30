---
title: "Mensagens agendadas e atrasadas:Roteamento com TTL e dead-letter exchange no RabbitMQ"
excerpt: "Precisa atrasar a entrega de uma mensagem em alguns minutos sem usar plugins adicionais no RabbitMQ? Aprenda como usar TTL e Dead-Letter Exchange."
category: "Mensageria"
date: "14 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O desafio de agendar eventos sem plugins

Muitas vezes, precisamos adiar a entrega de uma mensagem em nossa arquitetura de mensageria: por exemplo, enviar um e-mail de lembrete apenas 2 horas após a criação de uma conta, ou reprocessar uma transação temporariamente com falha após um atraso planejado de 10 minutos.

Embora o RabbitMQ possua um plugin oficial de mensagens atrasadas (`rabbitmq-delayed-message-exchange`), nem sempre temos permissão para instalá-lo em ambientes de nuvem gerenciados (como AWS Amazon MQ).

O **onkai-unified-bus** contorna essa limitação projetando uma topologia nativa baseada na expiração de tempo de vida (**TTL - Time-To-Live**) de mensagens direcionadas para uma **Dead-Letter Exchange (DLX)**.

## O fluxo de roteamento de mensagens atrasadas

Para atrasar uma mensagem, criamos um fluxo indireto:
1. Publicamos o evento em uma fila especial e temporária que **não possui consumidores**.
2. Definimos um tempo limite de expiração (`TTL`) nesta fila equivalente ao atraso desejado.
3. Configuramos uma Dead-Letter Exchange (`DLX`) na fila temporária, apontando para o destino real.
4. Quando o tempo expira, o RabbitMQ descarta a mensagem da fila temporária e a encaminha automaticamente para o destino configurado na DLX.

```go
package main

import (
	"context"
	"fmt"
	"github.com/rabbitmq/amqp091-go"
)

// SetupDelayedTopology cria a fila de expiração sem consumidores e a associa à exchange principal
func SetupDelayedTopology(ch *amqp091_go.Channel, delayMs int) (string, error) {
	delayQueueName := fmt.Sprintf("delay-queue-%dms", delayMs)
	
	// Declara a fila definindo argumentos especiais de expiração (TTL e DLX)
	_, err := ch.QueueDeclare(
		delayQueueName,
		true,  // durável
		false, // auto-delete
		false, // exclusiva
		false, // no-wait
		amqp091_go.Table{
			"x-message-ttl":             int32(delayMs),       // Tempo que a mensagem espera
			"x-dead-letter-exchange":    "main-event-exchange", // Destino pós expiração
			"x-dead-letter-routing-key": "notifications.send",
		},
	)
	return delayQueueName, err
}
```

## Benefícios da abordagem nativa

Ao usar esse padrão de roteamento:
- Evitamos dependências externas de plugins terceiros.
- Aproveitamos as garantias de persistência e segurança nativas do motor do RabbitMQ.
- Conseguimos configurar tempos de atraso variados declarando filas com TTLs sob demanda.

### Termos técnicos desmistificados
- **TTL (Time-To-Live):** O tempo máximo que uma mensagem pode permanecer na fila antes de ser descartada ou movida.
- **Dead-Letter Exchange (DLX):** Uma exchange para onde o RabbitMQ envia mensagens expiradas, rejeitadas ou que atingiram o limite de retentativas de uma fila.
- **Delayed Topology:** Estrutura de canais e filas desenhada para simular a retenção temporária controlada de dados.
