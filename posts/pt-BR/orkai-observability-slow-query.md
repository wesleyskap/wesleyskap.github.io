---
title: "Alertas em tempo real:Detectando slow queries e protegendo bancos de dados de degradação"
excerpt: "Consultas de banco lentas causam gargalos silenciosos e exaustão de conexões. Aprenda a desenhar um sistema autônomo de alerta de Slow Queries."
category: "Resiliência"
date: "05 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 11
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## O perigo silencioso das consultas lentas

Em bancos de dados relacionais, queries mal estruturadas (como varreduras completas em tabelas massivas por falta de índices apropriados) podem demorar segundos para retornar. Quando o tráfego da sua aplicação aumenta, essas consultas lentas passam a reter conexões físicas de banco por muito tempo. Em instantes, o pool de conexões do banco de dados atinge seu limite máximo, bloqueando novas requisições de clientes e gerando indisponibilidade completa do serviço.

A detecção tardia desses problemas (geralmente após a queda do banco em produção) é cara. O ideal é que a própria aplicação nos alerte ativamente assim que uma consulta ultrapasse um limite considerado saudável (**Slow Query Threshold**).

## Implementando alertas de slow queries no wrapper

O **orkai-observability** estende o wrapper de banco de dados para analisar o tempo de execução comparativamente com as regras de configuração da aplicação. Se a consulta demorar mais do que o limite aceito, ela dispara automaticamente um log de nível `WARN` especial:

```go
package main

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type Config struct {
	EnableSlowQueryAlert bool
	SlowQueryThreshold   time.Duration
}

type ResilientDB struct {
	db     *sql.DB
	config Config
}

// ExecuteQuery executa a query e valida se ela atinge o limite de alerta de lentidão
func (rdb *ResilientDB) ExecuteQuery(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	startTime := time.Now()
	rows, err := rdb.db.QueryContext(ctx, query, args...)
	duration := time.Since(startTime)

	// Valida se os alertas estão ativos e se a latência ultrapassou o threshold
	if rdb.config.EnableSlowQueryAlert && duration > rdb.config.SlowQueryThreshold {
		log.Printf("[SLOW QUERY WARN] A consulta demorou %v para executar (Limite: %v) | Query: %s", 
			duration, rdb.config.SlowQueryThreshold, query,
		)
	}

	return rows, err
}
```

## Benefícios do alerta pró-ativo

Com esse padrão configurado em sua infraestrutura:
- O time de desenvolvimento localiza imediatamente gargalos de banco antes que eles saturem os servidores de produção.
- Monitoramos flutuações de comportamento do banco de dados causadas por crescimento inesperado de tabelas.
- Integramos logs estruturados a sistemas de notificação automática (como Slack ou PagerDuty).

### Termos técnicos desmistificados
- **Slow Query:** Consulta de banco de dados cujo tempo total de processamento ultrapassa um limite aceitável predefinido (geralmente medido em milissegundos).
- **Threshold (Limiar):** O valor limite configurado usado como regra de decisão para disparar alertas ou mudar estados no sistema.
- **Connection Pool:** Coleção de conexões físicas de banco de dados pré-inicializadas e prontas para uso concorrente, evitando o custo de abrir novas conexões a cada requisição.
