---
title: "Orquestração de fluxos complexos:DAGs e batches relacionais no runiq"
excerpt: "Como rodar grafos de tarefas com dependências ou lotes paralelos usando apenas SQL puro e garantias transacionais? Veja o design interno de DAGs e Batches no Runiq."
category: "Sistemas Distribuídos"
date: "24 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Indo além das filas simples:A necessidade de orquestração

Fazer com que workers consumam uma fila linear de tarefas atende a 80% dos casos simples. No entanto, à medida que os sistemas de software evoluem, as regras de negócios exigem dependências e fluxos mais elaborados:

1.  **Deduplicação (Jobs Únicos):** Impedir que uma tarefa de "Sincronizar Conta" seja enfileirada novamente se uma igual já estiver na fila aguardando execução.
2.  **Batches (Processamento MapReduce):** Disparar 100 jobs de processamento de imagem em paralelo e, somente quando todos terminarem, executar uma tarefa de callback para "Enviar Notificação de Sucesso".
3.  **DAGs (Grafos Acíclicos Dirigidos / Workflows):** Definir que o Job C só pode rodar quando o Job A e o Job B completarem com sucesso. Caso o Job A falhe de forma irrecuperável, o Job C deve ser cancelado automaticamente (falha em cascata).

No **Orkai Runiq**, essas funcionalidades de nível empresarial são implementadas diretamente no nível de armazenamento usando transações SQL comuns, evitando a necessidade de motores de workflow dedicados como o Temporal.

---
## Como funcionam os DAGs relacionais do runiq

A joia da coroa da orquestração do Runiq é seu motor de dependências estruturado sobre tabelas relacionais (`queue/postgres_workflow.go` e `queue/sqlite_workflow.go`).

Quando você enfileira um fluxo de trabalho com dependências (usando `DependsOn` e `EnqueueWorkflow`), o Runiq realiza os seguintes passos:

### 1. estado inicial bloqueado
Se um Job filho possui dependências, ele é gravado no banco de dados diretamente com o status `"blocked"` em vez de `"pending"`. Isso impede que qualquer worker tente consumi-lo antes da hora. As relações de dependência são salvas na tabela `runiq_job_dependencies (job_id, parent_job_id)`.

### 2. resolução dinâmica (sucesso)
Quando um worker finaliza uma tarefa com sucesso, o Runiq chama o método `resolveDependencies` dentro da transação de confirmação (`Ack`):

```go
func (p *PostgresStorage) resolveDependencies(ctx context.Context, tx *sql.Tx, parentJobID string) error {
	// 1. Busca todos os IDs dos filhos que dependem deste pai
	childIDs, err := p.queryChildJobIDs(ctx, tx, parentJobID)
	if err != nil {
		return err
	}
	
	// 2. Remove o registro desta dependência específica
	if _, err := tx.ExecContext(ctx, p.q("DELETE FROM runiq_job_dependencies WHERE parent_job_id = $1"), parentJobID); err != nil {
		return err
	}
	
	// 3. Verifica se os filhos ainda têm outros pais pendentes
	return p.checkBlockedChildren(ctx, tx, childIDs)
}
```

No método `checkBlockedChildren`, o Runiq conta se o filho ainda possui dependências ativas. Se o contador for zero (`count == 0`), significa que todos os pais do filho já terminaram com sucesso. O Runiq então transiciona o status do filho de `"blocked"` para `"pending"` na mesma transação, disponibilizando-o instantaneamente na fila.

### 3. falha em cascata
Se um job pai esgotar todas as suas tentativas máximas e falhar definitivamente, o Runiq executa uma **propagação de falha em cascata**. Os jobs filhos são automaticamente movidos para o estado `"dead"` (DLQ) com a mensagem de erro `"Dependency <parent_job_id> failed"`, limpando o grafo recursivamente.

---
## Batches com callbacks integrados

O suporte a processamento em lote (Batch) segue um fluxo semelhante de rastreamento transacional. Ao registrar um Batch:

1.  Criamos um registro de lote com o número total de tarefas e configuramos o `callback` (um envelope de job comum que será disparado no final).
2.  Cada tarefa concluída do lote decrementa de forma atômica o contador de tarefas ativas do Batch no banco.
3.  Quando o contador chega a zero, a transação que confirmou o último job enfileira automaticamente o job de callback cadastrado.

```go
// Exemplo de uso de Batch de alta performance:
batchID := "invoice-batch-2026"
callbackJob := &queue.JobEnvelope{
	Queue: "notifications",
	Name:  "NotifyBillingComplete",
	Args:  []byte(`{"batch_id":"invoice-batch-2026"}`),
}

// Inicializa o lote
_ = client.CreateBatch(ctx, batchID, callbackJob, nil)

// Enfileira tarefas associadas a esse lote
for _, invoice := range invoices {
	job := &queue.JobEnvelope{
		Queue: "billing",
		Name:  "ProcessInvoice",
		Args:  invoice.JSON(),
	}
	_ = client.EnqueueInBatch(ctx, batchID, job)
}

// Sela o lote para execução
_ = client.SubmitBatch(ctx, batchID)
```

---
## Termos técnicos desmistificados

*   **DAG (Grafo Acíclico Dirigido):** Uma estrutura matemática de nós (tarefas) conectados por setas direcionais (dependências) sem loops fechados. É ideal para representar sequências de processos onde passos dependem de outros anteriores.
*   **Callback:** Uma função ou tarefa que é passada como argumento para ser executada automaticamente assim que um determinado evento ou conjunto de operações assíncronas for finalizado.
*   **Transacional (Garantia Transacional):** Propriedade que garante que um grupo de operações no banco de dados ocorra de forma "tudo-ou-nada". Se uma única etapa falhar, todas as alterações anteriores do mesmo bloco de código são desfeitas (*rollback*).
