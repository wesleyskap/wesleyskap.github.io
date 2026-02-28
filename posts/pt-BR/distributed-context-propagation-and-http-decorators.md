---
title: "Propagação Distribuída e Resiliência de Transporte: W3C, B3 e HTTP Client Decorators"
excerpt: "Como manter o rastreamento ativo em chamadas HTTP remotas? Aprenda a propagar contextos de telemetria utilizando cabeçalhos W3C e B3 decorando o net/http do Go de forma transparente."
category: "Conectividade"
date: "28 de Fevereiro, 2026"
readTime: "4 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## Cabeçalhos de Telemetria e Padrões Industriais

Um identificador de rastreamento isolado em um único servidor perde o valor em uma arquitetura de microsserviços. Quando uma requisição de usuário trafega por múltiplos sistemas através da rede, o identificador do fluxo precisa ser transmitido de ponta a ponta. Caso contrário, a rastreabilidade se perde, tornando a depuração de falhas distribuídas uma tarefa quase impossível.

Para unificar a comunicação de telemetria, o Orkai suporta dois padrões industriais amplamente adotados:
- **W3C Trace Context:** Utiliza um cabeçalho único padronizado chamado `traceparent`, dividido no formato `versao-traceID-spanID-flags` (ex: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`).
- **B3 Propagation:** Padrão comum do ecossistema Spring/Zipkin, que transmite as informações em cabeçalhos individuais específicos (`X-B3-TraceId`, `X-B3-SpanId`) ou em um único cabeçalho consolidado chamado `b3`.

Desenvolvemos algoritmos rápidos e eficientes que analisam e decodificam essas strings brutas diretamente no momento em que as requisições chegam às nossas middlewares, associando o Trace ID decodificado à pilha de execução atual.

```go
// Exemplo didático de parsing eficiente do padrão W3C:
func parseW3C(header string) (string, bool) {
	parts := strings.Split(header, "-")
	if len(parts) < 4 {
		return "", false
	}
	// O segundo elemento da cadeia contem o ID exclusivo de 32 caracteres hexadecimais
	traceID := parts[1]
	return traceID, true
}
```

## Decorando a Interface Nativa de Transporte (`http.RoundTripper`)

Exigir que os desenvolvedores injetem manualmente os cabeçalhos de Trace ID em cada chamada externa de API HTTP é um anti-padrão de engenharia. Isso gera acoplamento e abre margem para esquecimentos graves que quebram o rastreamento da infraestrutura.

O Go resolve esse problema de maneira brilhante através da interface nativa `http.RoundTripper`. Ela define o fluxo de transporte de rede do cliente HTTP padrão.

No Orkai, implementamos o **TracingRoundTripper**, uma estrutura que decora a interface de transporte nativa. Ao registrar o transporte customizado no cliente HTTP, todas as chamadas externas efetuadas pela aplicação são interceptadas automaticamente de forma invisível. O decorator extrai o Trace ID ativo da pilha concorrente e o injeta nos cabeçalhos de saída da requisição antes do envio físico, mantendo o fluxo de negócios 100% limpo de telemetria.

```go
type TracingRoundTripper struct {
	next http.RoundTripper // Próximo transporte na cadeia (geralmente http.DefaultTransport)
}

func (t *TracingRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// Obtém o Trace ID ativo na pilha LIFO da goroutine atual
	activeID := observability.GetActiveTraceID()
	if activeID != "" {
		// Injeta os cabeçalhos nos padrões oficiais para transmissão de rede
		req.Header.Set("X-Trace-ID", activeID)
		req.Header.Set("traceparent", fmt.Sprintf("00-%s-%s-01", activeID, generateRandomSpanID()))
	}
	// Repassa a requisição tratada para o fluxo normal de rede
	return t.next.RoundTrip(req)
}
```

### Termos Técnicos Desmistificados
- **Propagação de Contexto (Context Propagation):** O processo de empacotar, transmitir e desempacotar metadados de rastreamento através das fronteiras físicas de rede entre serviços distintos.
- **RoundTripper:** Uma interface essencial da biblioteca padrão do Go que gerencia o ciclo completo de envio de uma requisição HTTP e recebimento de sua resposta.
- **Padrão Decorator (Decorator Pattern):** Um padrão de arquitetura de software que permite adicionar novos comportamentos a um objeto existente sem alterar seu código-fonte ou sua assinatura original.
