---
title: "Métricas de máquina:Desenvolvendo um coletor de recursos de sistema e memória do Go runtime"
excerpt: "Como monitorar o consumo real de memória, ciclos de Garbage Collector e contagem de goroutines ativas em Go? Crie um coletor em background."
category: "Métricas & Tracing"
date: "27 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## A importância de monitorar a saúde do runtime

Para garantir a confiabilidade de serviços expostos à internet, monitorar apenas o status das requisições HTTP (como códigos 200 ou 500) não é suficiente. Um microsserviço pode estar respondendo com sucesso às requisições, mas sofrendo silenciosamente com vazamento de memória (Memory Leak) ou empilhamento excessivo de rotinas paralelas (**Goroutine Leak**), preparando o terreno para uma queda inesperada do servidor por falta de memória física (Out-Of-Memory).

Para antecipar e diagnosticar esses gargalos, o **orkai-observability** disponibiliza um coletor em segundo plano dedicado a ler métricas internas de saúde do runtime do Go e expô-las de forma estruturada.

## Monitorando recursos internos com runtime.memstats

O ecossistema Go disponibiliza a biblioteca nativa `runtime` para extrair detalhes estatísticos sobre alocações de memória heap, pilhas ativas e comportamento de limpeza do Garbage Collector:

```go
package main

import (
	"context"
	"log"
	"runtime"
	"time"
)

type ResourceCollector struct {
	interval time.Duration
}

func NewResourceCollector(interval time.Duration) *ResourceCollector {
	return &ResourceCollector{interval: interval}
}

// Start coleta e imprime as estatísticas de runtime periodicamente
func (c *ResourceCollector) Start(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)

				numGoroutines := runtime.NumGoroutine()
				heapAllocMB := float64(m.HeapAlloc) / 1024 / 1024
				gcRuns := m.NumGC

				log.Printf("[Telemetry] Goroutines: %d | Heap Alloc: %.2f MB | Total GC Runs: %d", 
					numGoroutines, heapAllocMB, gcRuns,
				)
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}
```

## Exportando os dados para painéis visuais

Esses dados de sistema são expostos diretamente em nosso endpoint `/metrics` no formato oficial do Prometheus, permitindo criar gráficos informativos de longo prazo no Grafana:
- **`go_goroutines`:** Contador instantâneo de goroutines ativas na CPU.
- **`go_memstats_heap_alloc_bytes`:** Bytes de memória ativa alocados na heap dinâmica.
- **`go_gc_duration_seconds`:** Distribuição temporal das pausas geradas pelo Garbage Collector.

### Termos técnicos desmistificados
- **Goroutine Leak:** Falha de programação onde goroutines são iniciadas mas nunca finalizadas, consumindo memória de forma crescente e infinita.
- **Memory Leak:** Alocação de memória na heap que perde suas referências mas não pode ser liberada pelo Garbage Collector.
- **MemStats:** Estrutura interna de estatísticas do Go que guarda métricas detalhadas sobre o alocador de memória do sistema.
