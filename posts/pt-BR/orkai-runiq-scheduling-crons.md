---
title: "Agendamento e Crons Distribuídos: Resolvendo o Problema da Execução Duplicada"
excerpt: "Como garantir que um agendamento Cron rode exatamente uma vez por minuto em um cluster de servidores sem um coordenador como o ZooKeeper? Entenda a mecânica por trás do Orkai Runiq."
category: "Sistemas Distribuídos"
date: "29 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---

## O Problema dos Agendadores em Clusters

Agendar uma tarefa para rodar no futuro (ex: `client.EnqueueIn(ctx, ..., 10*time.Minute)`) é relativamente simples. Basta salvar o carimbo de data/hora de execução (`run_at`) no banco de dados e ter um loop periódico buscando jobs onde `run_at <= CURRENT_TIMESTAMP`.

O verdadeiro desafio surge com **tarefas recorrentes (Cron Jobs)** rodando em uma infraestrutura distribuída (múltiplas réplicas da sua aplicação rodando no Kubernetes, por exemplo). Se cada réplica possuir um motor interno de agendamento baseado no horário do servidor, quando o relógio bater meia-noite (`00:00`), **todas as réplicas dispararão a mesma tarefa simultaneamente**, resultando em relatórios duplicados, cobranças duplicadas ou emails repetidos para seus clientes.

Para resolver isso de forma elegante sem adicionar um sistema de coordenação distribuída pesado (como Consul ou Apache ZooKeeper), o Runiq adota uma solução engenhosa e simplificada baseada no próprio banco de dados relacional (ou Redis).

---

## O Motor do Cron e a Trava Distribuída de Minuto

No Runiq, a sincronização de execução do Cron baseia-se em um mecanismo de **trava por carimbo de minuto**. 

A cada tick do scheduler interno do worker (que roda a cada 10 segundos buscando agendamentos que coincidam com a expressão cron padrão de 5 campos), a réplica tenta adquirir uma trava exclusiva para a tarefa específica no minuto exato atual, truncando os segundos.

Vejamos como isso é orquestrado no driver de PostgreSQL (`queue/postgres_process.go`):

```go
func (p *PostgresStorage) LockCronExecution(ctx context.Context, cronName string, executionMinute time.Time) (bool, error) {
	// Limpa travas antigas para não saturar a tabela
	_, _ = p.db.ExecContext(ctx, p.q("DELETE FROM runiq_cron_locks WHERE execution_minute < $1"), time.Now().Add(-1*time.Hour))
	
	// Tenta inserir a trava para o minuto truncado
	res, err := p.db.ExecContext(ctx, p.q(`
		INSERT INTO runiq_cron_locks (cron_name, execution_minute, acquired_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (cron_name, execution_minute) DO NOTHING`),
		cronName, executionMinute.Truncate(time.Minute), time.Now(),
	)
	if err != nil {
		return false, err
	}
	
	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}
```

### O Segredo do ON CONFLICT DO NOTHING
A tabela `runiq_cron_locks` possui uma restrição de chave primária composta (ou índice único) composta por `(cron_name, execution_minute)`.

1.  **A Corrida:** Se o Cron `"DailyReport"` for disparado à meia-noite, todas as 5 réplicas do worker pool chamarão `LockCronExecution` com o carimbo `2026-06-24 00:00:00` (truncado para o minuto).
2.  **O Vencedor:** A primeira chamada que atingir o banco inserirá a linha e retornará `1` linha afetada (`rows > 0`). Ela prosseguirá enfileirando o job.
3.  **Os Perdedores:** As outras 4 chamadas concorrentes baterão na restrição de índice único do banco de dados. O banco aplicará a instrução `ON CONFLICT DO NOTHING`, ignorando a inserção sem levantar erros. O Runiq identificará `rows == 0` (0 linhas afetadas) e abortará silenciosamente o enfileiramento nessas réplicas.

Essa abordagem simples de design elimina o risco de duplicações sem adicionar latência perceptível e com garantia transacional estrita (ACID) do banco de dados.

---

## Crons Estáticos vs. Crons Dinâmicos com Timezone

Para oferecer a máxima flexibilidade de operação, o Runiq implementa dois modos de suporte a Cron:

1.  **Crons Estáticos (Definidos no Código):** Registrados durante a inicialização do Worker Pool. São imutáveis e servem para tarefas estruturais do sistema:
    ```go
    pool.RegisterCron("*/15 * * * *", "default", "CleanupSession", []byte(`{}`))
    ```
2.  **Crons Dinâmicos (Definidos no Painel/API):** Salvos na tabela `runiq_cron_jobs`. Eles podem ser pausados, editados, criados ou excluídos dinamicamente sem a necessidade de novos deploys de código.

### Suporte Nativo a Fusos Horários (Timezones)
Um erro comum de agendamento em produção é assumir que o servidor sempre rodará no fuso horário UTC e que todos os clientes estão sob as mesmas regras. O Runiq permite configurar o fuso horário específico de execução da tarefa de forma dinâmica:

```go
loc, _ := time.LoadLocation("America/Sao_Paulo")
pool.RegisterCron("0 9 * * 1-5", "default", "DailyReport", []byte(`{}`), queue.WithCronLocation(loc))
```

Sob o capô, o Runiq avalia a correspondência do Cron carregando o horário local correspondente à timezone informada na tabela (`timezone`) antes de validar a correspondência da string de cronologia (ex: `*/15 * * * *`). Isso garante que tarefas corporativas rodem exatamente no horário comercial local, mesmo sob mudanças de horário de verão e independente da timezone nativa do host onde a aplicação Go está rodando.

---

## Termos Técnicos Desmistificados

*   **Truncate (Truncar):** O ato de cortar frações de tempo menores de um objeto de data. Por exemplo, truncar `17:45:32` no nível de minuto transforma-o em `17:45:00`.
*   **Timezone Location:** O identificador geográfico (como `America/Sao_Paulo` ou `Europe/London`) que mapeia as regras históricas de fuso horário e horário de verão de uma região, diferente de um simples offset estático como `UTC-3`.
*   **Garantia ACID:** Conjunto de propriedades de transações de banco de dados (Atomicidade, Consistência, Isolamento e Durabilidade) que garantem a confiabilidade dos dados mesmo em caso de falhas ou concorrência pesada.
