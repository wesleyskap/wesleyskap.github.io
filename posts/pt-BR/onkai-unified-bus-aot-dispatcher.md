---
title: "Dispatcher sem reflexão:Otimizando performance e suportando compilação native AOT"
excerpt: "A reflexão dinâmica degrada a performance do Garbage Collector e quebra compilações nativas AOT. Veja como projetamos um roteador livre de reflexão em Go."
category: "Mensageria"
date: "16 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 10
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## Os desafios do dispatch dinâmico e da compilação AOT

Em sistemas de mensageria tradicionais, quando um novo evento chega, o roteador do barramento precisa descobrir dinamicamente qual classe ou estrutura consome aquele tipo de mensagem. Na maioria das linguagens de programação, isso é feito em tempo de execução inspecionando tipos por meio de **Reflexão (Reflection)**.

Apesar de ser uma abordagem simples e flexível, a reflexão traz sérios problemas:
1. **Custo de Performance:** Inspecionar e invocar métodos dinamicamente aloca variáveis na memória *heap*, criando um gargalo constante para o coletor de lixo.
2. **Incompatibilidade com Native AOT (Ahead-of-Time):** Compiladores AOT removem códigos e metadados de reflexão não utilizados durante a compilação para gerar binários ultraleves. Chamar código via reflexão dinâmica falha ou gera erros misteriosos em produção.

O **onkai-unified-bus** resolve isso substituindo invocações dinâmicas por um despachante tipado estaticamente via cache concorrente de executores tipados.

## Roteamento de eventos baseado em executors tipados

Em vez de buscar o método de processamento do consumidor via reflexão a cada mensagem, o barramento registra objetos executores genéricos durante a inicialização da aplicação. O despachante delega o fluxo por meio de interfaces estáticas:

```go
package main

import (
	"context"
	"fmt"
	"sync"
)

// Consumer define o contrato para os consumidores de eventos
type Consumer[T any] interface {
	Consume(ctx context.Context, event T) error
}

// ConsumerExecutor encapsula a chamada tipada estaticamente para evitar reflexão
type ConsumerExecutor interface {
	Execute(ctx context.Context, payload []byte) error
}

type TypedConsumerExecutor[T any] struct {
	consumer Consumer[T]
	decoder  func(data []byte) (T, error)
}

func (e *TypedConsumerExecutor[T]) Execute(ctx context.Context, payload []byte) error {
	event, err := e.decoder(payload)
	if err != nil {
		return err
	}
	return e.consumer.Consume(ctx, event)
}
```

## O despachante livre de reflexão (registry)

No recebimento da mensagem, o despachante localiza o executor estático em um mapa de concorrência segura (`sync.Map`) indexado pelo nome do evento, realizando uma chamada direta de interface em poucos nanossegundos:

```go
type EventDispatcher struct {
	executors sync.Map // Mapeia o nome do evento para o ConsumerExecutor correspondente
}

func (d *EventDispatcher) RegisterConsumer(eventName string, executor ConsumerExecutor) {
	d.executors.Store(eventName, executor)
}

func (d *EventDispatcher) Dispatch(ctx context.Context, eventName string, payload []byte) error {
	execVal, exists := d.executors.Load(eventName)
	if !exists {
		return fmt.Errorf("nenhum consumidor registrado para o evento: %s", eventName)
	}
	
	executor := execVal.(ConsumerExecutor)
	return executor.Execute(ctx, payload) // Execução estática e rápida
}
```

### Termos técnicos desmistificados
- **Native AOT (Ahead-of-Time):** Tecnologia de compilação que converte código-fonte diretamente em código de máquina nativo da plataforma alvo no momento do build, dispensando interpretadores ou compiladores JIT.
- **Reflection-free Dispatcher:** Padrão de design de roteadores que utiliza interfaces estáticas ou lambdas gerados no build para chamar funções sem inspecionar a estrutura de objetos em tempo de execução.
- **Type Casting:** Conversão explícita de uma interface ou variável genérica para o seu tipo estrutural original ou específico em Go/C#.
