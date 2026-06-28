---
title: "Concorrência Segura: FOR UPDATE SKIP LOCKED no Postgres e SQLite com WAL no Runiq"
excerpt: "Como garantir que múltiplos workers distribuídos não consumam a mesma tarefa sem gerar gargalos de travamento? Descubra o funcionamento do SKIP LOCKED e o segredo do SQLite concorrente em Go."
category: "Performance & Concorrência"
date: "28 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---

## O Desafio da Concorrência: A Corrida das Goroutines

Em sistemas distribuídos, múltiplos workers rodando em paralelo em diferentes servidores ou goroutines tentam obter a próxima tarefa da fila simultaneamente. Se dois workers tentarem retirar o mesmo job ao mesmo tempo, podemos ter um cenário catastrófico de execução dupla.

Para evitar isso, motores tradicionais implementam travas complexas ou usam canais de comunicação dedicados com locks de memória no broker. Como o **Orkai Runiq** é standalone e usa bancos de dados relacionais para persistência, a responsabilidade de garantir a exclusão mútua recai sobre o banco de dados.

Contudo, fazer isso de forma ingênua usando travas de tabela inteira (`LOCK TABLE`) destrói o desempenho do processador. O segredo está em obter e trancar apenas a linha que será processada, de forma totalmente isolada.

---

## PostgreSQL: FOR UPDATE SKIP LOCKED

No driver de PostgreSQL (`queue/postgres.go`), o Runiq resolve a concorrência usando o recurso **`SKIP LOCKED`**. O fluxo de trabalho de busca e trancamento é feito de forma transacional e atômica:

```go
func (p *PostgresStorage) Dequeue(ctx context.Context, queueName string, workerTags []string) (*JobEnvelope, error) {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	
	// Busca as próximas tarefas pendentes ordenadas por prioridade
	env, err := p.dequeueTx(ctx, tx, queueName, workerTags)
	if err != nil || env == nil {
		return env, err
	}
	
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return env, nil
}
```

Durante a transação, executamos uma query que localiza a linha específica do job e a atualiza para `status = 'running'` usando um sub-select atômico com `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE runiq_jobs SET status = 'running', locked_at = CURRENT_TIMESTAMP
WHERE job_id = (
	SELECT job_id FROM runiq_jobs
	WHERE job_id = $1 AND status = 'pending' FOR UPDATE SKIP LOCKED
)
RETURNING job_id, queue, name, args, trace_id, span_id, attempts, max_attempts, unique_key, batch_id, priority, tags
```

### O que acontece sob o capô?
1. **`FOR UPDATE`:** Bloqueia a linha selecionada para escrita, impedindo que outras transações a modifiquem.
2. **`SKIP LOCKED`:** Se outro worker concorrente já tiver iniciado uma transação e bloqueado aquela mesma linha específica (`jobID`), a busca atual **ignora silenciosamente** essa linha travada e passa para a próxima linha da lista.

Isso elimina filas de espera e gargalos por locks (*lock contention*). Os workers nunca ficam travados esperando que outro finalize; eles simplesmente "pulam" o que já está sendo processado por outros.

---

## SQLite: Otimização Lock-Free com modo WAL e Busy Timeouts

O SQLite é frequentemente descartado em projetos concorrentes devido ao seu clássico erro `database is locked`. No entanto, com a configuração de engenharia correta, ele funciona como um motor de processamento de filas leve e extremamente rápido.

No driver do SQLite (`queue/sqlite.go`), o Runiq ativa duas diretivas cruciais (`PRAGMA`) logo no momento de abertura da conexão:

```go
func NewSqliteStorage(db *sql.DB) (*SqliteStorage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Ativa o modo Write-Ahead Logging (WAL)
	_, _ = db.ExecContext(ctx, "PRAGMA journal_mode=WAL;")

	// 2. Define o tempo máximo de espera antes de falhar por lock
	_, _ = db.ExecContext(ctx, "PRAGMA busy_timeout=5000;")
	
	// ...
}
```

### Por que o modo WAL muda o jogo?
Tradicionalmente (modo *Rollback Journal*), o SQLite bloqueia todo o arquivo de banco de dados para qualquer leitura quando uma escrita está ocorrendo. 

Com o **WAL (Write-Ahead Logging)** habilitado:
1. **Leitores e Escritores não se bloqueiam:** Multiplas consultas de leitura podem rodar de forma concorrente enquanto um processo está escrevendo no banco de dados. Os novos dados gravados são anexados a um arquivo separado `.wal` de forma extremamente rápida.
2. **Busy Timeout:** Se ocorrer um breve conflito de escrita, o driver Go espera pacientemente até 5 segundos (`5000ms`) por uma liberação rápida antes de retornar erro, permitindo que microtransações concorrentes terminem sem falhas.

No método `dequeueTx`, o Runiq seleciona até 100 registros pendentes no SQLite, seleciona o primeiro compatível com as tags de execução do worker em memória, atualiza seu status para `'running'` e comete a transação imediatamente, minimizando a janela de lock de escrita:

```go
func (s *SqliteStorage) dequeueTx(ctx context.Context, tx *sql.Tx, queueName string, workerTags []string) (*JobEnvelope, error) {
	query := `
		SELECT job_id, queue, name, args, trace_id, span_id, attempts, max_attempts, unique_key, batch_id, priority, tags
		FROM runiq_jobs
		WHERE queue = ? AND status = 'pending' AND (run_at IS NULL OR strftime('%s', run_at) <= strftime('%s', 'now'))
		ORDER BY priority DESC, created_at ASC LIMIT 100`
	
	rows, err := tx.QueryContext(ctx, s.q(query), queueName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	selected, err := findMatchingJob(rows, workerTags)
	if err != nil || selected == nil {
		return selected, err
	}

	upd := "UPDATE runiq_jobs SET status = 'running', locked_at = CURRENT_TIMESTAMP WHERE job_id = ?"
	_, err = tx.ExecContext(ctx, s.q(upd), selected.JobID)
	return selected, err
}
```

---

## Termos Técnicos Desmistificados

*   **Lock Contention (Contenção de Locks):** Fenômeno que ocorre quando múltiplos threads ou processos tentam adquirir a mesma trava ao mesmo tempo, fazendo com que a maioria deles fique bloqueada esperando e degradando a performance.
*   **Write-Ahead Logging (WAL):** Técnica de gravação onde as alterações são escritas em um arquivo de log sequencial separado antes de serem aplicadas ao banco de dados principal. Isso melhora a concorrência porque leituras e escritas podem rodar simultaneamente.
*   **PRAGMA (SQLite):** Comandos específicos do SQLite usados para modificar a operação do motor de banco de dados e alterar configurações internas de performance e comportamento.
