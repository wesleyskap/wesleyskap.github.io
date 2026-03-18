---
title: "Zero-Allocation Dispatcher: Roteando Milhões de Eventos Sem Alocações na Heap em Go"
excerpt: "Como projetar um despachante de eventos concorrente de alta performance na memória? Descubra como o onkai-unified-bus usa sync.Pool e pooling de goroutines para obter vazão massiva livre de Garbage Collector."
category: "Mensageria"
date: "17 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## O Gargalo das Alocações Dinâmicas em Barramentos de Alta Vazão

Em arquiteturas orientadas a eventos de alta performance, cada microssegundo conta. Quando implementamos um barramento de eventos (Event Bus) local em Go, o padrão mais comum é criar goroutines dinâmicas e alocar fatias de dados (slices) para cada mensagem publicada. Embora simples, essa abordagem gera um grande volume de objetos de curta duração na memória dinâmica *heap*. Como consequência, o coletor de lixo (Garbage Collector - GC) é ativado de forma agressiva, causando pausas indesejadas (stop-the-world) que degradam o rendimento global do sistema.

Para resolver isso de forma elegante, o **onkai-unified-bus** adota uma estratégia de alocação de memória virtualmente nula (zero-allocation). Em vez de alocar novas estruturas de dados a cada evento despachado, nós reutilizamos as estruturas existentes e mantemos um conjunto fixo de operários concorrentes (Worker Pool).

## Reaproveitando Recursos com sync.Pool

O segredo para evitar alocações na heap em Go é a reciclagem de objetos por meio do pacote `sync.Pool`. Nós criamos uma piscina de objetos reutilizáveis para envelopar as mensagens do barramento. Após o processamento completo de um evento pelos consumidores, limpamos os dados do envelope e o devolvemos à piscina.

```go
type EventEnvelope struct {
	Topic   string
	Payload []byte
	Headers map[string]string
}

var envelopePool = sync.Pool{
	New: func() interface{} {
		return &EventEnvelope{
			Headers: make(map[string]string),
		}
	},
}

func AcquireEnvelope(topic string, payload []byte) *EventEnvelope {
	env := envelopePool.Get().(*EventEnvelope)
	env.Topic = topic
	env.Payload = payload
	return env
}

func ReleaseEnvelope(env *EventEnvelope) {
	env.Topic = ""
	env.Payload = nil
	for k := range env.Headers {
		delete(env.Headers, k)
	}
	envelopePool.Put(env)
}
```

## Pooling de Workers Concorrentes

Em vez de iniciar uma nova goroutine para cada mensagem (uma prática que consome recursos de CPU e agenda desnecessária), o `onkai-unified-bus` inicializa um conjunto estático de workers concorrentes durante a inicialização. Cada worker ouve um canal interno do dispatcher e processa as mensagens de forma sequencial e extremamente rápida, garantindo que o consumo de memória do barramento permaneça plano, independente da taxa de transferência de eventos de entrada.

### Termos Técnicos Desmistificados
- **Heap:** A área de memória do sistema onde os dados com ciclo de vida dinâmico são alocados em tempo de execução. O acesso e gerenciamento dela são mais custosos do que a pilha (Stack).
- **sync.Pool:** Uma estrutura de sincronização nativa de Go que armazena objetos temporários para reutilização futura, reduzindo a pressão sobre o coletor de lixo.
- **Worker Pool:** Um padrão de design concorrente onde um grupo predefinido de processos ou threads aguarda tarefas em uma fila compartilhada.
