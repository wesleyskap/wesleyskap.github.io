---
title: "Resiliência extrema:Backoff com jitter, circuit breaker de storage e dashboard SPA"
excerpt: "Falhas de rede e sobrecarga de banco de dados acontecem. Saiba como o Runiq protege sua infraestrutura usando Jitter, Circuit Breakers locais e monitoramento em tempo real."
category: "Operações & Resiliência"
date: "24 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Projetando para a falha inevitável

Em sistemas de produção, a pergunta não é *se* uma falha vai ocorrer, mas *quando*. APIs externas ficam indisponíveis, bancos de dados sofrem picos de CPU e conexões de rede oscilam.

Um motor de background jobs maduro precisa ser agressivamente defensivo. Ele deve garantir que erros temporários em tarefas de terceiros não derrubem o banco de dados principal e nem causem o temido efeito de "efeito manada" (*thundering herd*).

O **Orkai Runiq** implementa três mecanismos de resiliência e visibilidade de ponta para enfrentar cenários degradados:
1.  **Backoff Exponencial com Jitter:** Retentativas inteligentes de tarefas.
2.  **Circuit Breaker de Storage:** Proteção ativa do banco de dados/Redis do cliente.
3.  **Dashboard SPA Embarcado:** Visibilidade e gestão em tempo real de falhas.

---
## Retentativas inteligentes:Backoff e jitter

Quando uma tarefa falha em Go (por retornar um `error` na assinatura `Perform`), o Runiq calcula um tempo de espera exponencial antes de tentar executá-la novamente.

O algoritmo está centralizado em `queue/helpers.go`:

```go
func ComputeBackoffDelay(attempts int) time.Duration {
	delaySec := (1 << uint(attempts)) * 10
	if delaySec > 3600 {
		delaySec = 3600 // Teto máximo de 1 hora
	}
	jitterSec := time.Now().Nanosecond() % 3
	return time.Duration(delaySec+jitterSec) * time.Second
}
```

### Por que adicionar jitter?
Se 100 jobs falharem exatamente ao mesmo tempo devido a uma queda de internet de 5 segundos do servidor, e usarmos apenas backoff exponencial puro (`attempts * 10`), todos os 100 jobs tentarão rodar novamente no mesmo segundo exato no futuro. Isso sobrecarrega a rede instantaneamente.

Ao introduzir o **Jitter** (um pequeno ruído aleatório ou pseudoaleatório, como `time.Now().Nanosecond() % 3`), espalhamos ligeiramente o retorno dessas execuções ao longo do tempo. Esse pequeno descompasso suaviza o consumo de recursos na infraestrutura.

---
## Proteção de banco:Circuit breaker de storage

Se o seu banco de dados PostgreSQL começar a ficar lento (devido a consultas pesadas de relatórios paralelos, por exemplo), enfileirar novos jobs só vai piorar a situação.

Para proteger o storage contra colapso total, o cliente do Runiq (`queue/client.go` e `queue/circuit_breaker.go`) implementa um **Circuit Breaker** (Disjuntor) integrado:

```go
type CircuitBreakerConfig struct {
	Cooldown         time.Duration
	LatencyThreshold time.Duration
	FailureThreshold int
}
```

### Estados do circuit breaker:
*   **Closed (Fechado):** Fluxo normal. O Runiq envia comandos para o banco de dados.
*   **Open (Aberto):** Se a latência média de escrita exceder `LatencyThreshold` ou o número de falhas seguidas ultrapassar `FailureThreshold`, o disjuntor abre. Novas chamadas para enfileirar jobs falham imediatamente em nível de memória com o erro `ErrCircuitBreakerOpen`, sem sequer tocar no banco de dados. Isso dá "fôlego" para o banco de dados se recuperar da indisponibilidade ou lentidão.
*   **Half-Open (Meio Aberto):** Após o período de `Cooldown`, o Runiq deixa passar algumas consultas piloto. Se forem bem-sucedidas, ele fecha o disjuntor de novo; se falharem, reabre imediatamente.

---
## O dashboard SPA embarcado (zero dependências)

A melhor ferramenta de resiliência não serve para nada se o time de operações estiver "cego". O Runiq inclui um servidor HTTP nativo (`queue/server.go`) que serve um Dashboard SPA (Single Page Application) embutido no próprio binário em Go usando `embed.FS`.

Esse painel exibe estatísticas vitais e lista todas as tarefas organizadas por abas (Pendentes, Ativas, Processadas e Mortas). Quando uma tarefa falha definitivamente e vai para a **Dead Letter Queue (DLQ)**, o painel exibe o stack trace exato capturado no momento do panic ou erro.

Através do Dashboard ou da REST API integrada, os operadores de infraestrutura podem:
1.  **Pausar e resumir** filas individuais sob estresse.
2.  **Reprocessar (Redrive)** jobs da DLQ em massa.
3.  **Cancelar** agendamentos de tarefas e crons dinâmicos problemáticos.

O Dashboard não requer nenhuma instalação adicional de pacotes Node.js, Webpack ou CDNs externas — ele é puramente construído com CSS/JS vanilla embarcado, mantendo a promessa de dependência zero do Runiq.

---
## Termos técnicos desmistificados

*   **Jitter:** Adição de ruído aleatório em intervalos de tempo pré-determinados para evitar que processos concorrentes se sincronizem de forma destrutiva.
*   **Circuit Breaker (Disjuntor):** Padrão de design de software que impede uma aplicação de tentar executar repetidamente uma operação que provavelmente vai falhar, protegendo recursos escassos de rede ou computação.
*   **Dead Letter Queue (DLQ):** Fila de descarte/depósito onde são enviadas as mensagens ou tarefas que falharam definitivamente após excederem todas as tentativas permitidas, para que possam ser analisadas manualmente depois.
