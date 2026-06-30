---
title: "Propagação de baggage:Compartilhando metadados de negócio entre microsserviços com padrão W3C"
excerpt: "Traces de telemetria apenas correlacionam chamadas. Saiba como usar o padrão W3C Baggage para propagar dados de negócio através de toda a malha de serviços."
category: "Conectividade"
date: "03 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 10
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## Tracing vs. baggage:A diferença de conceito

No universo da observabilidade distribuída, os identificadores de tracing (`Trace ID` e `Span ID`) nos ajudam a montar o caminho físico de execução de uma requisição que navega por múltiplos microsserviços. Eles mostram a ordem das chamadas e onde ocorreram os gargalos.

Contudo, muitas vezes precisamos de algo mais: compartilhar metadados de negócio (como ID do Cliente, plano de assinatura ativa ou ID da organização) de forma global através de toda a malha de chamadas HTTP sem precisar alterar as assinaturas das APIs para passar esses dados manualmente.

O padrão **W3C Baggage** resolve isso permitindo que você transporte um mapa de pares de chave/valor através de cabeçalhos de rede HTTP padronizados de forma transparente.

## O funcionamento do W3C baggage

O W3C define o cabeçalho `baggage` como uma lista de chaves e valores formatados como string (ex: `customerId=alice,tenant=premium`). O **orkai-observability** implementa um parser robusto para ler e propagar esse contexto entre requisições:

```go
package main

import (
	"context"
	"strings"
)

type baggageKey struct{}

// ContextWithBaggage insere metadados de negócio no context.Context
func ContextWithBaggage(ctx context.Context, baggage map[string]string) context.Context {
	return context.WithValue(ctx, baggageKey{}, baggage)
}

// BaggageFromContext extrai o mapa de metadados do contexto ativo
func BaggageFromContext(ctx context.Context) map[string]string {
	if val, ok := ctx.Value(baggageKey{}).(map[string]string); ok {
		return val
	}
	return make(map[string]string)
}

// ParseBaggageHeader decodifica a string crua do cabeçalho W3C Baggage
func ParseBaggageHeader(header string) map[string]string {
	baggage := make(map[string]string)
	if header == "" {
		return baggage
	}
	pairs := strings.Split(header, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(strings.TrimSpace(pair), "=", 2)
		if len(kv) == 2 {
			baggage[kv[0]] = kv[1]
		}
	}
	return baggage
}
```

## Propagação automática em redes HTTP

Ao usar o `TracingRoundTripper` em nossos clientes HTTP, o middleware lê o mapa de Baggage ativo do contexto e o injeta automaticamente nos cabeçalhos HTTP de saída. Quando o serviço destino recebe a chamada, seu middleware correspondente reconstrói o contexto com esses mesmos metadados, mantendo as informações de negócio vivas por todo o fluxo distribuído de processamento.

### Termos técnicos desmistificados
- **W3C Baggage:** Padrão industrial que especifica o formato de cabeçalhos HTTP para transmissão de metadados não relacionados diretamente à árvore de traces (como contexto de negócios).
- **Context-Aware Mapping:** Ação de guardar e resgatar dinamicamente mapas e objetos a partir do objeto nativo `context.Context` em Go.
- **Malha de Serviços (Service Mesh):** Infraestrutura de rede projetada para gerenciar e monitorar a comunicação segura entre microsserviços.
