---
title: "Tracing assíncrono:Propagando contextos de telemetria entre microsserviços e eventos"
excerpt: "Como rastrear um fluxo de execução distribuído que atravessa filas assíncronas sem se perder? Aprenda a injetar e extrair contextos de trace em cabeçalhos de mensagens."
category: "Mensageria"
date: "28 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O desafio do rastreamento em fluxos assíncronos

Em arquiteturas de microsserviços tradicionais baseadas em chamadas HTTP ou gRPC síncronas, propagar o contexto de tracing para construir a árvore de chamadas é relativamente fácil. As requisições carregam os dados de trace nos cabeçalhos HTTP que são passados adiante de forma direta.

No entanto, em sistemas orientados a eventos, essa cadeia é interrompida. O produtor envia a mensagem para o broker e imediatamente finaliza sua execução. Horas ou segundos depois, o consumidor busca a mensagem e inicia o processamento. Como associar a telemetria do consumidor com a transação original iniciada no produtor?

O **onkai-unified-bus** resolve isso injetando e extraindo metadados de trace (W3C Trace Context) de forma transparente dentro dos cabeçalhos físicos de cada mensagem transportada.

## Injetando e extraindo o contexto de trace

Para garantir compatibilidade com as ferramentas de observabilidade líderes de mercado (como OpenTelemetry, Jaeger e Zipkin), o barramento expõe adaptadores de injeção e extração baseados no padrão W3C.

```go
import (
	"context"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// InjectTrace injeta os dados do trace ativo do context.Context nos cabeçalhos da mensagem
func InjectTrace(ctx context.Context, msg *Message) {
	propagator := otel.GetTextMapPropagator()
	carrier := propagation.MapCarrier(msg.Headers)
	propagator.Inject(ctx, carrier)
}

// ExtractTrace extrai os dados dos cabeçalhos da mensagem e devolve um novo context.Context ativo
func ExtractTrace(ctx context.Context, msg Message) context.Context {
	propagator := otel.GetTextMapPropagator()
	carrier := propagation.MapCarrier(msg.Headers)
	return propagator.Extract(ctx, carrier)
}
```

## Visualização ponta a ponta

Quando o produtor cria um evento, o Span ID ativo é serializado e mapeado no cabeçalho `traceparent` da mensagem. Quando a mensagem atinge o driver de transporte (ex: RabbitMQ), o middleware do consumidor intercepta a carga de trabalho, lê o cabeçalho `traceparent` usando a função `ExtractTrace` e inicia um novo Span filho a partir do trace pai original.

Com isso, mesmo que um evento seja agendado e processado minutos depois de ter sido gerado, seu gráfico de rastreamento no painel de controle da engenharia mostrará a correlação exata de todas as operações distribuídas.

### Termos técnicos desmistificados
- **W3C Trace Context:** Um padrão unificado do W3C que define cabeçalhos HTTP obrigatórios (`traceparent`, `tracestate`) para garantir a interoperabilidade de rastreamento entre sistemas heterogêneos.
- **Span ID:** Um identificador exclusivo gerado para rastrear uma unidade individual de trabalho (como uma consulta de banco de dados ou processamento de evento).
- **Map Carrier:** Um adaptador de estrutura de dados que mapeia os campos de rastreamento do OpenTelemetry em cabeçalhos de mapas string-string simples.
