---
title: "Resiliência em larga escala:Construindo um circuit breaker sem dependências e retries exponenciais"
excerpt: "Sistemas distribuídos falham. Chamar APIs instáveis sem controle gera o efeito manada. Mostramos como projetar uma máquina de estados de Circuit Breaker pura e um motor de retry com recuo exponencial em Go."
category: "Resiliência"
date: "04 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## A máquina de estados do circuit breaker

Quando um serviço de terceiros ou microsserviço dependente falha, retentar chamadas HTTP de forma descontrolada é perigoso. Isso cria um fenômeno conhecido como "tempestade de retentativas" (*retry storms*), sobrecarregando o serviço instável e ampliando o problema.

Para mitigar falhas em cascata, o Orkai incorpora um **Circuit Breaker** (Disjuntor) robusto construído do zero, sem nenhuma biblioteca externa. Ele monitora o fluxo de requisições e transiciona de forma dinâmica entre três estados:
- **CLOSED (Fechado):** Estado normal de operação. As chamadas passam livremente. Se a taxa de erro atingir um limite tolerável, o disjuntor desarma.
- **OPEN (Aberto):** O circuito detectou que o serviço parceiro está falhando. Todas as chamadas subsequentes são interrompidas em memória com um erro de falha rápida (*fast-fail*), sem disparar requisições de rede reais, poupando a infraestrutura.
- **HALF-OPEN (Meio-Aberto):** Após decorrido um tempo de espera (*cooldown*), o circuito permite que algumas requisições de teste passem. Se houver falha, ele volta para `OPEN`. Se todas passarem com sucesso, ele reestabelece o estado `CLOSED`.

Para garantir segurança de dados concorrentes sob acessos massivos, protegemos as transições de estados e os contadores de sucesso/erro utilizando travas de exclusão mútua (`sync.Mutex`).

[DIAGRAM_CIRCUIT_BREAKER]

```go
type CircuitBreakerState int
const (
	StateClosed CircuitBreakerState = iota
	StateOpen
	StateHalfOpen
)

type CircuitBreaker struct {
	mu           sync.Mutex
	state        CircuitBreakerState
	failures     int
	successes    int
	threshold    int
	openTime     time.Time
	cooldown     time.Duration
}

func (cb *CircuitBreaker) Execute(operation func() error) error {
	cb.mu.Lock()
	if cb.state == StateOpen {
		if time.Since(cb.openTime) > cb.cooldown {
			cb.state = StateHalfOpen // O cooldown expirou! Transiciona para testes
		} else {
			cb.mu.Unlock()
			return fmt.Errorf("circuit breaker is OPEN") // Bloqueio em memória (Fast-Fail)
		}
	}
	cb.mu.Unlock()

	err := operation()

	cb.mu.Lock()
	defer cb.mu.Unlock()
	if err != nil {
		cb.recordFailure()
		return err
	}
	cb.recordSuccess()
	return nil
}
```

## Algoritmo de recuo exponencial com espera progressiva

Em cenários de falhas de rede de curta duração, tentar reexecutar a requisição imediatamente é ineficaz. O algoritmo de **Exponential Backoff** (Recuo Exponencial) resolve isso aumentando o intervalo de tempo entre as retentativas consecutivas de forma geométrica: $intervalo = base \times 2^{tentativa}$. 

Dessa forma, a primeira falha aguarda, por exemplo, 100ms, a segunda 200ms, a terceira 400ms, dando tempo para que o serviço parceiro ou a conexão de rede se restabeleça gradualmente.

```go
func ExecuteWithRetry(maxRetries int, baseDelay time.Duration, op func() error) error {
	var err error
	for attempt := 0; attempt < maxRetries; attempt++ {
		err = op()
		if err == nil {
			return nil // Operação realizada com sucesso
		}
		// Atraso progressivo exponencial: base * 2^tentativa
		delay := baseDelay * time.Duration(math.Pow(2, float64(attempt)))
		time.Sleep(delay) // Aguarda o período calculado
	}
	return err
}
```

### Termos técnicos desmistificados
- **Falha em Cascata (Cascading Failure):** Efeito dominó onde a lentidão ou erro de um único componente consome recursos (como threads ou conexões) de outros servidores, fazendo com que todo o sistema caia.
- **Falha Rápida (Fast-Fail):** Mecanismo de defesa que rejeita requisições imediatamente se souber de antemão que o alvo está offline, evitando alocação desnecessária de conexões ou CPU.
- **Exponential Backoff:** Técnica matemática usada para estender de forma progressiva o atraso antes de cada retentativa sucessiva de uma operação de rede com falha.
