---
title: "Log de payloads HTTP:Implementando amostragem inteligente para evitar saturação"
excerpt: "Logar requisições e respostas HTTP inteiras consome espaço massivo e degrada performance. Aprenda a aplicar amostragem de payloads em Go."
category: "Alta Performance"
date: "13 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 13
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## O equilíbrio de visibilidade e performance

Em ambientes de microsserviços, ter visibilidade total do que entra e sai nas requisições HTTP (Payloads de Request e Response) é crucial para investigar falhas de validação ou comportamentos anômalos de integrações. No entanto, gravar o JSON de todas as requisições em disco traz dois problemas graves:
1. **Consumo Exacerbado de Armazenamento:** Se sua API trafega payloads grandes ou arquivos binários, sua ferramenta de agregação de logs (Elasticsearch/Loki) ficará saturada rapidamente, gerando custos financeiros altos.
2. **Perda de Vazão computacional:** Ler e converter arrays de bytes constantemente de conexões de rede aumenta o uso de CPU e adiciona milissegundos à latência percebida pelo cliente.

Para atingir o equilíbrio ideal, o **orkai-observability** implementa um motor de **Amostragem Inteligente (Payload Sampling)** de dados HTTP.

## O design do middleware com amostragem

Configuramos o middleware HTTP para processar payloads baseando-se em uma taxa de amostragem configurada (ex: logar apenas 10% dos payloads das requisições bem-sucedidas), com uma exceção vital: se o status HTTP final indicar uma falha do servidor (`>= 500`), o payload é logado de forma obrigatória para garantir inspecionabilidade:

```go
package main

import (
	"bytes"
	"io"
	"math/rand"
	"net/http"
)

type SamplingConfig struct {
	SampleRate float64 // Valor entre 0.0 (0%) e 1.0 (100%)
}

type PayloadLogger struct {
	config SamplingConfig
}

func (pl *PayloadLogger) LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Determina se a requisição atual deve ser amostrada de forma aleatória
		shouldSample := rand.Float64() < pl.config.SampleRate

		var bodyBuffer []byte
		if shouldSample {
			// Consome e clona o body da requisição sem esvaziar o fluxo original
			if r.Body != nil {
				bodyBuffer, _ = io.ReadAll(r.Body)
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBuffer))
			}
		}

		// Encapsula o ResponseWriter para interceptar a resposta
		rec := &responseRecorder{ResponseWriter: w, body: bytes.NewBuffer(nil)}
		
		next.ServeHTTP(rec, r)

		// Lógica de gravação pós-execução
		isError := rec.statusCode >= 500
		if shouldSample || isError {
			// Executa a escrita estruturada do payload no log
			pl.writePayloadLog(r.URL.Path, bodyBuffer, rec.body.Bytes(), rec.statusCode)
		}
	})
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

func (rec *responseRecorder) Write(b []byte) (int, error) {
	rec.body.Write(b)
	return rec.ResponseWriter.Write(b)
}

func (pl *PayloadLogger) writePayloadLog(path string, req, resp []byte, status int) {
	// Lógica real de log estruturado formatado
}
```

### Termos técnicos desmistificados
- **Payload:** Os dados úteis transmitidos em uma transação de rede (geralmente o corpo JSON enviado em uma requisição POST/PUT ou retornado na resposta).
- **Sampling (Amostragem):** Técnica de coletar apenas um subconjunto representativo de dados para análise para economizar recursos computacionais e de rede.
- **NopCloser:** Utilitário do Go que encapsula um leitor simples de bytes sem comportamento real de fechamento físico de conexão.
