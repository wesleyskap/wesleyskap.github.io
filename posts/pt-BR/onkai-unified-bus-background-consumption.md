---
title: "Consumo de mensagens em segundo plano:Projetando um hosted service resiliente"
excerpt: "Como executar o consumo contínuo e assíncrono de eventos sem bloquear a thread principal de uma aplicação? Desenhe um worker de background resiliente."
category: "Mensageria"
date: "08 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## A importância do processamento assíncrono isolado

Em microsserviços modernos, os servidores web processam requisições HTTP rápidas e de curta duração. No entanto, o consumo de mensagens de tópicos ou filas de mensagens (como RabbitMQ, Kafka ou NATS) requer um fluxo diferente: uma escuta contínua e assíncrona. Esse loop de leitura de mensagens não pode rodar na mesma thread de execução das requisições web, caso contrário ele iria congelar o servidor principal.

Para resolver isso, o **onkai-unified-bus** implementa um motor de execução em segundo plano (Worker/Background Service) que gerencia o ciclo de vida do consumo de mensagens de forma isolada e resiliente.

## Implementando um background worker de consumo

O worker de segundo plano encapsula o loop infinito de escuta do broker de transporte. Ele inicia juntamente com a inicialização do container da aplicação e garante o tratamento correto de interrupções via contextos de cancelamento (`context.Context`):

```go
package main

import (
	"context"
	"log"
	"sync"
	"time"
)

type MessageConsumer struct {
	driver    Driver
	topic     string
	stopChan  chan struct{}
	waitGroup sync.WaitGroup
}

func NewMessageConsumer(driver Driver, topic string) *MessageConsumer {
	return &MessageConsumer{
		driver:   driver,
		topic:    topic,
		stopChan: make(chan struct{}),
	}
}

// Start inicia a goroutine que consome mensagens de forma assíncrona
func (mc *MessageConsumer) Start(ctx context.Context) {
	mc.waitGroup.Add(1)
	go func() {
		defer mc.waitGroup.Done()
		log.Printf("[Consumer] Iniciando escuta no tópico: %s", mc.topic)

		err := mc.driver.Subscribe(ctx, mc.topic, func(msg Message) error {
			// Simula o processamento lógico da mensagem
			log.Printf("[Consumer] Processando mensagem: %s", msg.ID)
			return nil
		})

		if err != nil {
			log.Printf("[Consumer] Erro na assinatura do tópico: %v", err)
		}
	}()
}

// Stop finaliza a escuta de forma graciosa drenando execuções ativas
func (mc *MessageConsumer) Stop() {
	close(mc.stopChan)
	mc.waitGroup.Wait()
	log.Println("[Consumer] Escuta finalizada graciosamente.")
}
```

## Tratamento de falhas e ciclo de vida da conexão

Um worker em segundo plano de produção não pode quebrar a aplicação caso a rede com o broker oscile. Por isso, a camada de consumo integra-se ao driver para restabelecer a escuta automaticamente após desconexões:
- Monitoramento contínuo das conexões físicas.
- Declaração de topologia sob demanda (re-criação de filas se deletadas).
- Cancelamento cooperativo com `context.Context` durante o shutdown da máquina.

### Termos técnicos desmistificados
- **Background Service:** Um processo executado em segundo plano que realiza tarefas contínuas (como ler uma fila) sem interações diretas com o cliente.
- **Graciosa Drenagem (Graceful Drain):** O processo de parar o recebimento de novos eventos e aguardar a conclusão das mensagens ativas antes de terminar o processo.
- **Cancelamento Cooperativo:** Padrão onde rotinas paralelas monitoram um sinal centralizado (como contexto ou canal) para parar sua execução imediatamente.
