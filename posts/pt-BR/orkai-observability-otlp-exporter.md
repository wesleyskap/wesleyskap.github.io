---
title: "Integração padrão OTel:Construindo um exportador OTLP http/json nativo sem dependências"
excerpt: "Aproveite a padronização do OpenTelemetry sem carregar pacotes externos pesados. Veja como exportar spans e logs nativamente em Go."
category: "Métricas & Tracing"
date: "16 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 15
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## O custo de pacotes pesados do SDK oficial do OTel

O ecossistema do **OpenTelemetry (OTel)** consolidou-se como o padrão da indústria para exportar logs, métricas e traces estruturados. No entanto, o SDK oficial para Go possui uma árvore de dependências extremamente pesada e complexa. Para microsserviços pequenos, carregar todas essas dependências aumenta consideravelmente o tamanho final do binário compilado e adiciona overhead de CPU.

Como o protocolo de comunicação padrão do OpenTelemetry (**OTLP - OpenTelemetry Protocol**) é aberto e estruturado em requisições de rede comuns, podemos ignorar os SDKs pesados e exportar nossos dados diretamente para qualquer coletor externo (como Jaeger, Datadog ou OpenTelemetry Collector) usando o formato HTTP/JSON nativo.

## O design do exportador OTLP nativo

O **orkai-observability** implementa um exportador em segundo plano que reúne lotes (*batches*) de spans e os envia periodicamente de forma assíncrona por meio de requisições POST para a API de ingestão oficial do OTel Collector (`/v1/traces`):

```go
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type OTLPSpan struct {
	TraceID           string `json:"traceId"`
	SpanID            string `json:"spanId"`
	Name              string `json:"name"`
	StartTimeUnixNano int64  `json:"startTimeUnixNano"`
	EndTimeUnixNano   int64  `json:"endTimeUnixNano"`
}

type OTLPExporter struct {
	collectorURL string
	client       *http.Client
}

func NewOTLPExporter(collectorURL string) *OTLPExporter {
	return &OTLPExporter{
		collectorURL: collectorURL,
		client:       &http.Client{Timeout: 5 * time.Second},
	}
}

// ExportSpans envia o lote de traces mapeado no formato padrão OTLP
func (e *OTLPExporter) ExportSpans(ctx context.Context, spans []OTLPSpan) error {
	payload := map[string]any{
		"resourceSpans": []any{
			map[string]any{
				"scopeSpans": []any{
					map[string]any{
						"spans": spans,
					},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", e.collectorURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}
```

## Benefícios do exportador sob medida

Implementando o envio de forma nativa:
- Mantemos a flexibilidade e a compatibilidade do padrão industrial OpenTelemetry.
- Garantimos um binário final ultraleve, otimizando o consumo de memória do container.
- Controlamos políticas personalizadas de retry e buffers de envio local.

### Termos técnicos desmistificados
- **OTLP (OpenTelemetry Protocol):** Protocolo padrão projetado pela CNCF para formatação e transmissão de telemetria entre agentes coletores.
- **OTel Collector:** Um proxy de alto desempenho que recebe, processa e exporta dados de telemetria para múltiplos backends.
- **Resource Spans:** O elemento raiz da especificação JSON OTLP que descreve a origem da máquina geradora dos traces.
