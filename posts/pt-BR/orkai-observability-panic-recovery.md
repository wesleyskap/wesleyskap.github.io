---
title: "Resiliência HTTP: Desenhando um Middleware de Panic Recovery para Interceptar Quedas de Servidor"
excerpt: "Falhas de runtime inesperadas não podem derrubar seu servidor web. Aprenda como interceptar panics e retornar respostas de erro elegantes e estruturadas em Go."
category: "Resiliência"
date: "26 de Abril, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Risco dos Falhas Críticas em Produção

Em Go, quando uma goroutine tenta ler um índice inválido de uma fatia (*slice*), acessa um ponteiro nulo (`nil pointer dereference`) ou executa qualquer operação lógica inválida em tempo de execução, o runtime do Go dispara uma pane (**Panic**). Se esse pânico não for capturado de forma explícita pela aplicação, a thread do servidor web cairá instantaneamente, desconectando todos os demais usuários ativos do sistema.

Para construir APIs de alta disponibilidade, precisamos interceptar pânicos ocorridos dentro das requisições HTTP individuais, logar a stack trace detalhada para investigação e retornar uma resposta amigável de erro `500 Internal Server Error` sem interromper o processo global do servidor.

## Implementando o Middleware de Panic Recovery

O Go disponibiliza a função nativa `recover()` que intercepta o fluxo de pânico da goroutine corrente. Capturamos isso criando um middleware que decora o handler HTTP original usando a palavra-chave `defer`:

```go
package main

import (
	"log"
	"net/http"
	"runtime/debug"
)

// PanicRecoveryMiddleware captura panes e devolve um erro HTTP 500 no formato JSON
func PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				// Captura e imprime o rastreamento da pilha de chamadas (Stack Trace)
				stack := debug.Stack()
				log.Printf("[Recover] Pane interceptada! Erro: %v\nStack Trace:\n%s", err, stack)

				// Devolve um retorno elegante em formato JSON para o cliente
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error": "Internal Server Error", "msg": "Um erro inesperado ocorreu no servidor."}`))
			}
		}()
		
		// Executa o próximo handler na cadeia HTTP
		next.ServeHTTP(w, r)
	})
}
```

## A Importância da Coleta de Stack Trace

Imprimir apenas a mensagem de erro do pânico (como `nil pointer`) dificulta a investigação do bug em sistemas com milhões de linhas de código. O uso de `debug.Stack()` captura a assinatura exata do local e das funções que geraram a pane, permitindo que a equipe de engenharia identifique a linha exata da falha física em segundos.

### Termos Técnicos Desmistificados
- **Panic:** Estado de erro grave do Go Runtime que interrompe o fluxo normal de processamento do programa atual.
- **Recover:** Função interna do Go usada para capturar e recuperar o controle de um pânico em andamento dentro de funções deferred.
- **Defer:** Instrução que agenda a execução de uma função para o momento exato em que a função envolvente retornar.
