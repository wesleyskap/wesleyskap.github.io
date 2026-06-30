---
title: "Segurança de dados:Implementando máscaras de pii baseadas em expressões regulares (regex)"
excerpt: "Vazar dados pessoais em arquivos de logs quebra regulamentações de dados como LGPD e GDPR. Aprenda a mascarar PII usando Regex de forma dinâmica."
category: "Alta Performance"
date: "07 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 12
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## O desafio da privacidade de dados nos logs

Ao depurar sistemas complexos, é comum que desenvolvedores imprimam objetos inteiros de requisição nos logs de depuração. No entanto, esses objetos podem conter informações pessoais dos usuários (como CPFs, dados de cartão de crédito, e-mails, senhas ou tokens JWT). 

Se essas informações forem gravadas em texto aberto nos arquivos de log, sua empresa estará violando leis de privacidade como a LGPD (Lei Geral de Proteção de Dados) no Brasil ou o GDPR na Europa, além de expor os clientes a falhas de segurança críticas.

O **orkai-observability** resolve isso implementando uma camada integrada de sanitização baseada em **Expressões Regulares (Regex)** que analisa e mascara valores confidenciais em tempo de execução.

## O design do sanitizador de pii com regex

Criamos um motor de máscaras que varre os textos ou campos do log e substitui correspondências de padrões estruturados (como padrões de CPF ou tokens) por uma máscara protetora (`[MASKED_PATTERN]`):

```go
package main

import (
	"regexp"
	"sync"
)

type PIISanitizer struct {
	mu       sync.RWMutex
	patterns map[string]*regexp.Regexp
}

func NewPIISanitizer() *PIISanitizer {
	s := &PIISanitizer{
		patterns: make(map[string]*regexp.Regexp),
	}
	// Padrão básico para CPF (ex: 123.456.789-00 ou apenas números)
	s.RegisterPattern("CPF", `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`)
	// Padrão básico para cartões de crédito
	s.RegisterPattern("CreditCard", `\b(?:\d[ -]*?){13,16}\b`)
	
	return s
}

// RegisterPattern registra um novo padrão dinamicamente sob bloqueio de escrita thread-safe
func (s *PIISanitizer) RegisterPattern(name, regexStr string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.patterns[name] = regexp.MustCompile(regexStr)
}

// Sanitize processa o texto substituindo informações sensíveis
func (s *PIISanitizer) Sanitize(input string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	output := input
	for _, re := range s.patterns {
		output = re.ReplaceAllString(output, "[MASKED_PATTERN]")
	}
	return output
}
```

## Sanitização dinâmica concorrente-safe

Por ser um processo executado de forma concorrente em todas as requisições, o sanitizador utiliza travas de leitura e escrita (`sync.RWMutex`). Isso permite que múltiplas goroutines sanitizem mensagens ao mesmo tempo de forma rápida e bloqueia o processo apenas durante o registro dinâmico de novos padrões de Regex.

### Termos técnicos desmistificados
- **PII (Personally Identifiable Information):** Qualquer dado estruturado que permita identificar direta ou indiretamente um indivíduo específico.
- **Expressão Regular (Regex):** Uma sintaxe especial que descreve padrões textuais complexos para busca e substituição rápida de strings.
- **RWMutex (Read-Write Mutex):** Trava de controle concorrente que permite que múltiplos leitores acessem um dado compartilhado em paralelo, mas garante acesso exclusivo a um único escritor.
