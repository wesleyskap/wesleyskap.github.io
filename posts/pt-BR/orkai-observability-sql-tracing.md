---
title: "Visibilidade de banco de dados:Criando um tracesql context wrapper para medir latência de queries"
excerpt: "As consultas de banco de dados costumam ser os maiores gargalos de latência de uma API. Aprenda como automatizar o tracing de SQL nativamente em Go."
category: "Métricas & Tracing"
date: "30 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 9
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## A caixa preta das consultas de banco de dados

Quando a latência de uma API HTTP aumenta, a primeira ação comum de desenvolvedores é inspecionar o código lógico da rota. No entanto, na enorme maioria dos casos reais, o gargalo reside na camada de acesso a dados: índices de tabelas ausentes, consultas não otimizadas (problemas de N+1) ou bloqueios de transações longas.

Sem instrumentação adequada nas funções de banco de dados, essas queries tornam-se caixas pretas difíceis de rastrear. O **orkai-observability** introduz o utilitário `TraceSQL` para instrumentar e expor de forma detalhada o tempo de execução físico de todas as interações com bancos relacionais.

## Implementando o tracesql wrapper

O `TraceSQL` age como um wrapper contextual. Ele inicia um novo span de rastreamento associado à conexão, mede a latência da consulta usando carimbos de data/hora e anexa a string da query executada aos metadados do span:

```go
package main

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type InstrumentedDB struct {
	db *sql.DB
}

// TraceSQL executa uma consulta de banco de dados mensurando e logando sua latência real
func (idb *InstrumentedDB) TraceSQL(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	// Captura o momento exato do início da consulta
	startTime := time.Now()
	
	// Executa a consulta real no banco de dados
	rows, err := idb.db.QueryContext(ctx, query, args...)
	
	// Calcula a duração da consulta em milissegundos
	duration := time.Since(startTime)
	
	// Registra a latência no logger e na árvore de tracing distribuído
	log.Printf("[SQL] query: %s | duracao: %v | erro: %v", query, duration, err)
	
	return rows, err
}
```

## A extração das métricas chave

Com o uso do wrapper:
- Identificamos de forma instantânea quais tabelas ou consultas geram maiores latências.
- Registramos erros específicos de SQL (como violações de chaves únicas ou falhas de timeout de rede).
- Roteamos automaticamente os tempos de resposta para histogramas locais e para coletores externos compatíveis com OpenTelemetry.

### Termos técnicos desmistificados
- **Query Wrapper:** Padrão estrutural que envolve chamadas de banco de dados tradicionais para adicionar inteligência (como logs e telemetria) de forma transparente.
- **N+1 Query Problem:** Um anti-padrão comum de ORMs onde uma consulta principal gera outras N consultas adicionais subsequentes ao banco, degradando a performance.
- **Instrumentação:** Processo de adicionar código de telemetria e coleta de dados de execução em um sistema para monitorar seu comportamento.
