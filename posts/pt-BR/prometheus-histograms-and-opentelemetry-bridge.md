---
title: "Do Customizado ao Padrão de Mercado: Percentis Histogramas e a Ponte Semântica do OpenTelemetry"
excerpt: "Por que as médias de latência mentem? Descubra a matemática por trás do cálculo de percentis de cauda longa e como criamos uma ponte semântica limpa para suportar o padrão OpenTelemetry com roteamento duplo concorrente."
category: "Métricas & Tracing"
date: "14 de Março, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## A Ilusão Estatística da Média e a Matemática dos Percentis

Métricas baseadas unicamente na média aritmética mentem de forma grave para engenheiros de confiabilidade. Um servidor web pode apresentar uma latência média excelente de 15ms, ocultando que 1% de seus usuários enfrenta esperas catastróficas de 5 segundos devido a travas do Garbage Collector. Para mapear com exatidão a qualidade de serviço da cauda longa, precisamos calcular percentis estatísticos precisos (p50, p90, p99).

Computar percentis exatos exigiria reter indefinidamente todas as medições coletadas na memória RAM, o que causaria um vazamento e esgotamento de recursos em sistemas de produção. 

Para solucionar esse problema, o Orkai utiliza uma estrutura otimizada chamada **latencyReservoir**. Ela armazena um número fixo de amostras (limitado a 2000) em uma janela de dados deslizante segura para concorrência. Para computar os percentis (ex: p99), realizamos uma cópia isolada do slice interno (`copy(sorted, r.samples)`) para garantir que nenhuma race condition ocorra, ordenamos o slice temporário e extraímos o valor no índice proporcional correspondente.

```go
func (r *latencyReservoir) extractPercentile(p float64) float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	n := len(r.samples)
	if n == 0 {
		return 0.0
	}
	// Cria uma copia isolada para ordenacao segura sem travar/corromper dados internos
	sorted := make([]float64, n)
	copy(sorted, r.samples)
	sort.Float64s(sorted)

	idx := int(math.Ceil(p*float64(n))) - 1
	if idx < 0 {
		idx = 0
	} else if idx >= n {
		idx = n - 1
	}
	return sorted[idx]
}
```

## A Ponte Semântica do OpenTelemetry e Roteamento Duplo

A maioria das empresas modernas padronizou suas plataformas de monitoramento utilizando a especificação oficial do **OpenTelemetry (OTel)** da CNCF. Contudo, reescrever todas as APIs legadas para utilizar diretamente a API complexa do OTel é inviável financeiramente.

No Orkai, resolvemos isso desenvolvendo adaptadores leves (`NewOTelTracer` e `NewOTelMetrics`) que atuam como uma ponte semântica limpa. Eles traduzem de forma transparente as chamadas das nossas interfaces simplificadas para o SDK oficial do OpenTelemetry.

Além disso, implementamos o conceito de **Roteamento Duplo** (Double Routing): quando uma métrica de latência é gerada, nosso adaptador a encaminha simultaneamente tanto para o exportador do OTel Collector externo quanto para o motor do `InMemoryMetrics` local. Isso permite manter o endpoint tradicional `/metrics` Prometheus ativo de forma concomitante para consultas locais ultrarrápidas, sem degradar o desempenho do processador.

[DIAGRAM_DOUBLE_ROUTING]

```go
type otelMetrics struct {
	mu          sync.Mutex
	meter       metric.Meter
	instruments map[string]interface{}
	localEngine *InMemoryMetrics // Motor local Prometheus secundario
}

func (o *otelMetrics) RecordLatency(name string, val float64, labels map[string]string) {
	o.mu.Lock()
	// 1. Roteamento local primario
	o.localEngine.RecordLatency(name, val, labels)
	histogram := o.getOrCreateHistogram(name)
	o.mu.Unlock()

	// 2. Encaminhamento concorrente ao OpenTelemetry
	ctx := context.Background()
	histogram.Record(ctx, val, metric.WithAttributes(convertLabels(labels)...))
}
```

### Termos Técnicos Desmistificados
- **Outliers (Pontos Discrepantes):** Valores coletados em métricas que fogem dramaticamente do comportamento normal do sistema (ex: uma única requisição que demorou 10s em um mar de chamadas de 5ms).
- **Percentil (Percentile):** Divisão matemática que estabelece limites de desempenho. Dizer que o p95 é 200ms indica que 95% de todos os usuários experimentaram tempos de resposta mais rápidos que 200ms.
- **Roteamento Duplo (Double Routing):** Técnica de envio simultâneo de dados de telemetria a múltiplos destinos independentes sem que uma chamada interfira ou atrase a outra.
