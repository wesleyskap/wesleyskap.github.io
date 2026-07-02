---
title: "Prioridade de jobs, afinidade de workers e hardware tags:Orquestrando execução inteligente no runiq"
excerpt: "Como garantir que jobs críticos sejam processados primeiro e que tarefas que exigem GPU ou memória dedicada caiam exatamente no worker certo? Entenda o sistema de prioridade e afinidade do Orkai Runiq."
category: "Sistemas Distribuídos"
date: "01 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## O dilema da ordem justa em filas de background

Em sistemas de filas tradicionais, todos os jobs competem em igualdade. Um email de boas-vindas pode pular na frente de um cancelamento de assinatura urgente, e um job de processamento de imagem que exige GPU pode cair em um worker genérico sem aceleração gráfica, falhando miseravelmente.

Para resolver ambos os problemas sem adicionar complexidade de roteamento externo, o Orkai Runiq implementa dois mecanismos complementares: **prioridade numérica de jobs** e **afinidade baseada em tags de worker**.

---

## Prioridade numérica:Jobs críticos na frente da fila

Cada job no Runiq carrega um campo `priority` inteiro no envelope. Quanto maior o valor, mais cedo ele será processado. A ordenação é feita nativamente no SQL de dequeuing:

```go
func (env *JobEnvelope) WithPriority(priority int) *JobEnvelope {
	env.Priority = priority
	return env
}
```

```sql
-- PostgreSQL: dequeuing prioriza por priority DESC
SELECT job_id, queue, name, args, ...
FROM runiq_jobs
WHERE queue = $1 AND status = 'pending'
  AND (run_at IS NULL OR run_at <= CURRENT_TIMESTAMP)
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

### Cenários de uso
1. **Jobs críticos (prioridade 100):** Faturamento, cancelamento de conta, reembolso.
2. **Jobs normais (prioridade 0):** Envio de email de notificação, sincronização de cache.
3. **Jobs de manutenção (prioridade -10):** Limpeza de dados, geração de relatórios.

O cliente expõe uma API fluente para configurar a prioridade no momento do enfileiramento:

```go
job := queue.NewJob("default", "ProcessPayment", payload).
	WithPriority(100)

client.EnqueueJob(ctx, job)
```

---

## Tags de hardware:Afinidade entre worker e job

O segundo mecanismo resolve o problema oposto: nem todo worker pode executar qualquer job. Workers que rodam em máquinas com GPU ou memória abundante podem se autodeclarar com **tags de capacidade** durante a inicialização:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithWorkerTags("gpu", "high-memory"),
)
```

Do lado do job, o desenvolvedor especifica quais tags são obrigatórias para execução:

```go
gpuJob := queue.NewJob("ml", "TrainModel", modelPayload).
	RequireTags("gpu")

client.EnqueueJob(ctx, gpuJob)
```

O motor de matching roda dentro do método `Dequeue` no momento da busca. O worker informa suas tags, e o storage retorna apenas jobs cujas `tags` requeridas são um subconjunto das tags do worker:

```go
func matchTags(jobTags, workerTags []string) bool {
	if len(jobTags) == 0 {
		return true
	}
	for _, jt := range jobTags {
		found := false
		for _, wt := range workerTags {
			if jt == wt {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
```

### Como o matching funciona no ciclo de vida
1. O consumidor chama `storage.Dequeue(ctx, queueName, workerTags)` passando suas tags de capacidade.
2. O SQL (ou comando Redis) filtra jobs onde `tags` está vazio ou é um subconjunto das tags do worker.
3. Se nenhum job compatível for encontrado, o worker dorme 100ms e tenta novamente.

Isso elimina a necessidade de filas separadas por tipo de worker e mantém o roteamento 100% declarativo.

---

## Combinando prioridade e afinidade

O verdadeiro poder surge quando combinamos os dois mecanismos. Jobs de inferência de ML (alta prioridade + tag `gpu`) serão processados antes de jobs de limpeza (baixa prioridade) e apenas por workers com GPU:

```go
criticalGPUJob := queue.NewJob("ml", "RealTimeInference", payload).
	WithPriority(200).
	RequireTags("gpu", "low-latency")
```

O resultado é um sistema de filas que entende tanto a urgência do job quanto a capacidade do worker que vai executá-lo, sem depender de roteadores externos ou configMap de Kubernetes.

---

## Termos técnicos desmistificados

*   **Worker Affinity (Afinidade de Worker):** Mecanismo que vincula jobs a workers específicos baseado em características declaradas por ambos, garantindo que apenas workers compatíveis executem determinadas tarefas.
*   **Priority Inversion (Inversão de Prioridade):** Fenômeno onde um job de baixa prioridade bloqueia indiretamente um de alta prioridade. O Runiq evita isso com ordenação por `priority DESC` em nível de banco de dados.
*   **Tag Matching (Correspondência de Tags):** Algoritmo que verifica se todas as tags exigidas por um job estão presentes no conjunto de tags declarado pelo worker.
