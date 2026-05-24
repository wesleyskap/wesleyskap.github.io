---
title: "Automação de Diagnósticos: Profiling Sob Demanda com Auto-Triggered pprof em Go"
excerpt: "Investigar picos de CPU e memória em produção após o servidor cair é ineficaz. Aprenda a automatizar o profiling sob demanda usando pprof."
category: "Alta Performance"
date: "24 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 16
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Desafio de Capturar Gargalos Efêmeros

Picos repentinos no uso de CPU ou alocações de memória heap costumam acontecer em frações de segundo durante picos de acessos na produção. Tentar depurar esses incidentes de forma retroativa analisando apenas logs é um processo frustrante para engenheiros de confiabilidade de sistemas.

O Go disponibiliza a excelente ferramenta nativa `pprof` para realizar análises profundas de consumo computacional (Profiling). No entanto, rodar o `pprof` manualmente exige que o engenheiro esteja ativamente conectado ao servidor exatamente no momento do incidente de performance.

O **orkai-observability** resolve esse problema implementando um sistema **Auto-Triggered (Autodisparado)** que monitora recursos e captura perfis de diagnóstico automaticamente.

## O Design do Auto-Triggered Profiler

Configuramos um coletor em segundo plano que inspeciona o uso de recursos periodicamente. Se o limite de segurança for excedido, o profiler captura e grava um arquivo de perfil local automaticamente, respeitando uma política de cooldown para evitar degradação adicional de performance:

```go
package main

import (
	"context"
	"log"
	"os"
	"runtime"
	"runtime/pprof"
	"time"
)

type AutoProfiler struct {
	cpuThreshold     int
	lastTriggerTime time.Time
	cooldown         time.Duration
}

func NewAutoProfiler(cooldown time.Duration) *AutoProfiler {
	return &AutoProfiler{
		cooldown: cooldown,
	}
}

// CheckAndTriggerProfile monitora goroutines e grava perfis sob demanda se atingir limites
func (ap *AutoProfiler) CheckAndTriggerProfile(ctx context.Context) {
	numGoroutines := runtime.NumGoroutine()

	// Se ultrapassar o limite crítico de concorrência (ex: 5000 goroutines)
	if numGoroutines > 5000 {
		if time.Since(ap.lastTriggerTime) > ap.cooldown {
			ap.lastTriggerTime = time.Now()
			ap.captureCPUProfile()
		}
	}
}

func (ap *AutoProfiler) captureCPUProfile() {
	filename := "cpu_profile_" + time.Now().Format("20060102_150405") + ".pprof"
	f, err := os.Create(filename)
	if err != nil {
		log.Printf("[Profiler] Falha ao criar arquivo de perfil: %v", err)
		return
	}
	defer f.Close()

	log.Printf("[Profiler] Iniciando captura automatica de CPU Profile: %s", filename)
	if err := pprof.StartCPUProfile(f); err == nil {
		time.Sleep(5 * time.Second) // Captura 5 segundos de atividades
		ppprof.StopCPUProfile()
		log.Println("[Profiler] Captura de CPU finalizada.")
	}
}
```

## Importância do Cooldown

Profiling consome ciclos extras de processamento da CPU. Se o seu servidor estiver sofrendo um ataque DDoS e a contagem de goroutines disparar, capturar perfis consecutivamente sem intervalos de resguardo (Cooldown) iria esgotar rapidamente os recursos remanescentes da máquina. O gerenciamento de cooldown garante que o diagnóstico seja disparado de forma comedida e segura.

### Termos Técnicos Desmistificados
- **pprof:** Ferramenta interna do runtime do Go usada para coletar, visualizar e analisar dados de profiling (tempo de CPU, uso de heap, bloqueios e concorrência).
- **Profiling (Perfilamento):** Processo de análise de performance em tempo de execução que mede o consumo de recursos por partes individuais do código-fonte.
- **Cooldown:** Intervalo de tempo mínimo obrigatório que o sistema deve respeitar antes de repetir uma ação automatizada de alto consumo computacional.
---
