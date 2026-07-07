---
title: "Autoscaling, circuit breaker e arquivo morto:Resiliência operacional automatizada no runiq"
excerpt: "Picos de tráfego, falhas de banco e acúmulo de jobs antigos são inevitáveis. Veja como o Runiq escala workers automaticamente, se protege de degradação e arquiva o que não é mais necessário."
category: "Operações & Resiliência"
date: "07 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 8
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Operação autônoma em produção

Manter um processador de jobs saudável em produção exige decisões constantes: quantos workers manter? O que fazer quando o banco fica lento? Como lidar com milhões de jobs processados acumulados?

O Orkai Runiq resolve esses três problemas com mecanismos nativos que operam de forma autônoma, sem intervenção manual ou scripts externos.

---

## Autoscaling dinâmico de workers

Em vez de fixar o número de goroutines do worker pool, o Runiq permite configurar um **autoscaler** que ajusta a concorrência baseado na profundidade da fila:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithDynamicConcurrency(queue.DynamicConcurrencyConfig{
		CheckInterval:   5 * time.Second,
		MinConcurrency:  2,
		MaxConcurrency:  50,
		QueueDepthLimit: 100,
		ScaleUpStep:     5,
		ScaleDownStep:   2,
	}),
)
```

### O algoritmo de escala

O autoscaler roda em loop a cada `CheckInterval`, monitorando o total de jobs pendentes nas filas monitoradas:

```go
func (w *WorkerPool) runAutoscaleIteration(ctx context.Context) {
	pending, err := w.getMonitoredPendingCount(ctx)
	if err != nil {
		return
	}
	curr := w.currentConcurrency
	up, down := w.getAutoscaleSteps()
	if pending > w.autoscale.QueueDepthLimit {
		w.adjustConcurrency(curr + up) // escala para cima
		return
	}
	if pending == 0 {
		w.adjustConcurrency(curr - down) // escala para baixo
	}
}
```

A implementação usa um semáforo baseado em canal (`chan struct{}`). Escalar para cima consome tokens do semáforo (liberando goroutines para trabalhar); escalar para baixo devolve tokens (reduzindo o número de workers ativos):

```go
func (w *WorkerPool) setupSemaphore() {
	if w.autoscale == nil {
		w.sem = make(chan struct{}, w.concurrency)
		w.currentConcurrency = w.concurrency
		return
	}
	w.sem = make(chan struct{}, w.autoscale.MaxConcurrency)
	w.currentConcurrency = w.autoscale.MinConcurrency
	// Pré-preenche com a diferença para limitar a concorrência inicial
	diff := w.autoscale.MaxConcurrency - w.autoscale.MinConcurrency
	for i := 0; i < diff; i++ {
		w.sem <- struct{}{}
	}
}
```

Isso significa que o pool começa com o mínimo de workers e escala automaticamente sob carga, sem desperdiçar recursos em horários ociosos.

---

## Circuit breaker client-side

Quando o banco de dados está sob estresse, tentar enfileirar mais jobs só piora a situação. O Runiq implementa um **circuit breaker** no lado do cliente que falha rápido quando detecta degradação:

```go
client := queue.NewClient(storage,
	queue.WithCircuitBreaker(queue.CircuitBreakerConfig{
		Cooldown:         30 * time.Second,
		LatencyThreshold: 500 * time.Millisecond,
		FailureThreshold: 5,
	}),
)
```

### A máquina de estados

O circuit breaker gerencia três estados protegidos por `sync.RWMutex`:

```go
func (cb *circuitBreaker) beforeCall() error {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if cb.state == cbStateOpen {
		if time.Since(cb.lastStateChg) > cb.config.Cooldown {
			cb.state = cbStateHalfOpen
			cb.lastStateChg = time.Now()
			return nil
		}
		return ErrCircuitBreakerOpen // falha rápida
	}
	return nil
}

func (cb *circuitBreaker) afterCall(err error, elapsed time.Duration) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	isFail := err != nil ||
		(cb.config.LatencyThreshold > 0 && elapsed > cb.config.LatencyThreshold)
	if isFail {
		cb.failures++
		// Transiciona para OPEN se atingiu o limiar
	} else {
		cb.failures = 0
	}
}
```

1. **CLOSED:** Operações fluem normalmente. Falhas ou latências altas incrementam o contador.
2. **OPEN:** Após `FailureThreshold` falhas, o circuito abre. `beforeCall()` retorna `ErrCircuitBreakerOpen` instantaneamente.
3. **HALF-OPEN:** Após `Cooldown`, uma chamada de teste é permitida. Se bem-sucedida, o circuito fecha.

Isso protege o banco de receber writes desnecessários quando ele já está degradado, prevenindo efeito cascata.

---

## Arquivo morto automatizado (cold storage)

Jobs processados e mortos acumulados deixam as tabelas pesadas e degradam queries de dequeue. O Runiq oferece **archival automático** que move jobs antigos para uma tabela de archive:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithJobArchival(7*24*time.Hour, 1*time.Hour),
)
```

O processo roda apenas no nó líder e executa uma transação atômica de copiar e deletar:

```go
func (p *PostgresStorage) ArchiveJobs(ctx context.Context, age time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-age)
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	ins := `INSERT INTO runiq_archived_jobs
		SELECT * FROM runiq_jobs
		WHERE status IN ('processed', 'dead') AND updated_at <= $1
		ON CONFLICT (job_id) DO NOTHING`
	if _, err = tx.ExecContext(ctx, p.q(ins), cutoff); err != nil {
		return 0, err
	}
	del := `DELETE FROM runiq_jobs
		WHERE status IN ('processed', 'dead') AND updated_at <= $1`
	res, err := tx.ExecContext(ctx, p.q(del), cutoff)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	return rows, tx.Commit()
}
```

Com isso, jobs mais velhos que 7 dias são movidos para `runiq_archived_jobs` (disponíveis para auditoria) e removidos da tabela ativa, mantendo as queries de dequeue rápidas independentemente do volume histórico.

---

## Termos técnicos desmistificados

*   **Autoscaling (Escala Automática):** Ajuste dinâmico do número de workers concorrentes baseado em métricas de carga, como profundidade de fila pendente.
*   **Circuit Breaker (Disjuntor):** Padrão de resiliência que interrompe temporariamente operações propensas a falha para permitir recuperação do sistema downstream.
*   **Cold Storage / Job Archival:** Migração de registros antigos de uma tabela de operação ativa para uma tabela de archive, reduzindo o volume de dados em consultas críticas e mantendo a rastreabilidade para auditoria.
