---
title: "Gênese do Runiq: Projetando um Motor de Background Jobs Standalone em Go"
excerpt: "Por que construir um processador de tarefas do zero quando temos RabbitMQ ou Kafka? Explore as decisões de design, a arquitetura de acoplamento zero e as abstrações fundamentais do Orkai Runiq."
category: "Mensageria"
date: "26 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---

## O Dilema da Infraestrutura: Message Brokers vs. Job Processors

Quando precisamos processar tarefas pesadas em segundo plano (como envio de e-mails, processamento de relatórios ou transições de estado assíncronas), a primeira reação comum da equipe de engenharia é adotar ferramentas conhecidas do mercado: **RabbitMQ**, **Apache Kafka** ou **AWS SQS**.

No entanto, há uma diferença sutil, mas fundamental, entre **Message Brokers** (sistemas de transporte de mensagens) e **Job Processors** (motores de execução de tarefas):

*   **Message Brokers (RabbitMQ/Kafka):** São focados em roteamento de mensagens bruto, throughput extremo e entrega rápida de bytes. Eles desconhecem o ciclo de vida da tarefa que a mensagem descreve. Se uma mensagem falhar, o broker não tem inteligência nativa de backoff exponencial, de re-enfileirar condicionalmente ou de exibir o stack trace do erro no painel administrativo sem uma engenharia complexa por cima (como DLX combinada com TTL no RabbitMQ).
*   **Job Processors (Runiq, Sidekiq, Celery):** São projetados ao redor do conceito de **tarefa**. Eles entendem tentativas máximas, estado de execução (Pendente, Ativo, Processado, Morto), agendamentos futuros e orquestração de dependências entre tarefas.

O **Orkai Runiq** nasceu para preencher essa lacuna no ecossistema Go de forma **standalone (autônoma)**. Ele permite que desenvolvedores tenham o poder de um orquestrador de tarefas resiliente sem o ônus operacional de manter clusters Erlang (RabbitMQ) ou JVMs pesadas com ZooKeeper (Kafka). O Runiq requer apenas um storage provider existente na sua stack (PostgreSQL, Redis ou até mesmo um SQLite embarcado).

---

## Acoplamento Zero e Flexibilidade Orientada a Interfaces

Um dos pilares do design do Runiq é o **acoplamento fraco**. Em vez de forçar a aplicação a usar um banco de dados específico, toda a persistência é baseada em interfaces de Go pequenas e coesas.

A abstração central é a interface `JobQueue` definida em `queue/queue.go`:

```go
type JobQueue interface {
	// Enqueue persiste o envelope do job no backend de armazenamento
	Enqueue(ctx context.Context, env *JobEnvelope) error

	// Dequeue busca a próxima tarefa pendente respeitando concorrência e tags
	Dequeue(ctx context.Context, queue string, workerTags []string) (*JobEnvelope, error)

	// Ack marca a tarefa como concluída com sucesso
	Ack(ctx context.Context, jobID string) error

	// Fail registra a falha da execução da tarefa para retentativas ou DLQ
	Fail(ctx context.Context, jobID string, err error) error
}
```

Qualquer banco de dados ou motor de chave-valor que implemente essas assinaturas pode atuar como motor de armazenamento para o Runiq. Sob o capô, estendemos essas capacidades usando composição de interfaces, como `ScheduledJobQueue` (para jobs adiados), `BatchStorage` (para processamentos em lote) e `WorkflowStorage` (para grafos de dependência DAG).

---

## O Envelope do Job e a Propagação Dinâmica de Contexto

Para que um job seja persistido e posteriormente executado por um worker distribuído, ele precisa ser envelopado. O `JobEnvelope` carrega não apenas os argumentos serializados da tarefa, mas também metadados operacionais e de telemetria.

Um detalhe interessante de performance é a ordenação física dos campos na struct em Go. Campos maiores (como slices de strings e objetos de contexto) são declarados no topo, enquanto números menores ficam na base. Isso reduz o desperdício de memória por preenchimento de bytes estruturais (*struct padding*):

```go
type JobEnvelope struct {
	TraceContext TraceContext  `json:"trace_context"` // Rastreamento distribuído
	Args         []byte        `json:"args"`          // Payload em formato JSON
	Dependencies []string      `json:"dependencies,omitempty"`
	Tags         []string      `json:"tags,omitempty"`
	JobID        string        `json:"job_id"`
	Queue        string        `json:"queue"`
	Name         string        `json:"name"`
	UniqueKey    string        `json:"unique_key,omitempty"`
	BatchID      string        `json:"batch_id,omitempty"`
	RunAt        *time.Time    `json:"run_at,omitempty"`
	UniqueTTL    time.Duration `json:"unique_ttl,omitempty"`
	Priority     int           `json:"priority"`
	Attempts     int           `json:"attempts"`
	MaxAttempts  int           `json:"max_attempts"`
}
```

A presença de `TraceContext` é crucial. Ela permite que a rastreabilidade distribuída da gem `orkai-observability` (como `TraceID` e `SpanID`) seja injetada no momento em que o cliente enfileira o job e seja resgatada no momento em que um worker assíncrono em outra máquina inicia a execução, mantendo a árvore de chamadas de logs unificada de ponta a ponta.

---

## Como Começar: Uma API Simples e Fluida

Construir e rodar workers em Go com o Runiq é extremamente direto. A implementação padrão do cliente fornece helpers fluídos como `EnqueueIn` e `EnqueueUnique` que facilitam o dia a dia do desenvolvedor:

```go
// 1. Defina o Job implementando a assinatura Perform
type SendEmailJob struct{}

func (s *SendEmailJob) Perform(ctx context.Context, args []byte) error {
	// Sua lógica de envio aqui...
	return nil
}

func main() {
	// 2. Inicialize o Storage (ex: Postgres)
	storage, _ := queue.NewPostgresStorage(db)

	// 3. Configure o Worker Pool com concorrência = 5
	pool := queue.NewWorkerPool(storage, 5)
	pool.Register("SendEmail", &SendEmailJob{})

	// Roda o Worker em background
	go pool.Start(context.Background(), "emails")

	// 4. Envie o Job usando o Client
	client := queue.NewClient(storage)
	client.Enqueue(context.Background(), "emails", "SendEmail", []byte(`{"to":"user@example.com"}`))
}
```

A simplicidade dessa API esconde a complexidade interna do Runiq, que lida nativamente com panic recovery, concorrência, retentativas e propagação automática de spans de tracing de forma completamente invisível para quem está escrevendo a regra de negócio.

---

## Termos Técnicos Desmistificados

*   **Standalone:** Uma aplicação que funciona como um binário independente, que não requer outros serviços de apoio rodando externamente além do seu próprio armazenamento de dados.
*   **Struct Padding:** O alinhamento de memória feito pelo compilador. Go alinha campos de estruturas em múltiplos de bytes baseado no tamanho da palavra do processador. Organizar os campos do maior para o menor ajuda a economizar memória ao evitar espaços em branco.
*   **Boilerplate:** Código repetitivo que é necessário para configurar um sistema, mas que não adiciona valor direto à regra de negócio (como criar conexões de rede manuais em todas as funções).
