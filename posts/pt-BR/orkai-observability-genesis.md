---
title: "Criando um Logger JSON de Ultra-Performance e um Tracer LIFO do Zero em Go"
excerpt: "Como correlacionar logs estruturados com escopos complexos de execução sem poluir suas regras de negócios? Aprenda a desenhar um Logger livre de reflexão e um rastreador concorrente em Go."
category: "Concorrência & Arquitetura"
date: "22 de Fevereiro, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## A Anatomia da Reflexão e o Custo Oculto no Garbage Collector

Em sistemas de altíssima vazão, a geração de logs estruturados não pode se tornar um gargalo de desempenho. A maioria das bibliotecas tradicionais de JSON em Go utiliza o pacote `reflect` para inspecionar dinamicamente o tipo e os campos de cada objeto em tempo de execução. Embora flexível, esse processo acarreta alocações temporárias frequentes na memória dinâmica *heap*. Como consequência, o Garbage Collector (GC) do Go é acionado constantemente, gerando pausas de processamento que degradam a latência da sua API.

Para atingir ultra-performance, o Logger estruturado do Orkai elimina a reflexão por comportamento. Em vez disso, utilizamos uma conversão explícita baseada em switch de tipos nativos (`type switch`) e gravamos os bytes diretamente em um buffer sequencial (`bytes.Buffer`). Essa abordagem inteligente permite alocações de memória praticamente nulas na heap.

Outra otimização crítica é o **Mascaramento de Dados Sensíveis (PII / LGPD)**. Para garantir conformidade com a LGPD sem perder desempenho, o Logger armazena uma lista de chaves sensíveis (como `password`, `secret`, `cvv`) protegida por uma trava de leitura/escrita rápida (`sync.RWMutex`). Se uma chave sensível for detectada durante a serialização, seu valor é substituído instantaneamente por `"[MASKED]"` na saída JSON.

Além disso, para permitir que o nível de log (como transicionar de `INFO` para `DEBUG` sob incidentes) seja alterado em produção sem causar travamentos por concorrência, o Orkai utiliza operações atômicas da biblioteca padrão `sync/atomic` (`atomic.StoreInt32` e `atomic.LoadInt32`), fornecendo máxima velocidade e segurança.

```go
// Serialização rápida de campos estruturados sem reflexão:
func writeFields(buf *bytes.Buffer, fields []Field) {
	for _, f := range fields {
		buf.WriteString(",")
		buf.WriteString("\"" + f.Key + "\":")
		if isSensitiveKey(f.Key) {
			buf.WriteString("\"[MASKED]\"")
			continue
		}
		if f.IsInt {
			buf.WriteString(strconv.FormatInt(f.IntValue, 10))
		} else {
			buf.WriteString("\"" + f.StrValue + "\"")
		}
	}
}
```

## Rastreamento LIFO Transparente com Pilhas Concorrentes

Para correlacionar logs distribuídos, precisamos rastrear o escopo de execução ativo. A abordagem tradicional força o desenvolvedor a passar um objeto `context.Context` em todas as assinaturas de funções da aplicação. Isso polui as regras de negócios e gera código repetitivo desnecessário (*boilerplate*).

O Orkai resolve isso de forma elegante gerenciando o escopo ativo através de uma pilha baseada no princípio **LIFO (Last-In, First-Out)** associada à rotina de execução. 

Quando um novo escopo de processamento é iniciado (`StartSpan`), geramos um ID único e o adicionamos ao topo de uma fatia de dados (*slice*). Quando finalizamos o processamento (`EndSpan`), removemos o ID do topo da pilha, restaurando automaticamente o Trace ID pai. Para garantir a consistência das operações concorrentes em ambientes multi-thread, todas as mutações na pilha são protegidas por um mutex (`sync.Mutex`). Além disso, em caso de falhas críticas, o Logger captura frames de execução dinâmicos via `runtime.Callers` para incluir um stack trace compacto no log de erro.

```go
type LocalTracer struct {
	mu     sync.Mutex // Protege a integridade da pilha contra race conditions
	traces []string   // Fila LIFO de Trace IDs ativos
}

func (t *LocalTracer) Push(traceID string) {
	t.mu.Lock()
	t.traces = append(t.traces, traceID)
	t.mu.Unlock()
}

func (t *LocalTracer) Pop() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.traces) == 0 {
		return ""
	}
	lastIdx := len(t.traces) - 1
	popped := t.traces[lastIdx]
	t.traces = t.traces[:lastIdx] // Remove o último elemento inserido (LIFO)
	return popped
}
```

### Termos Técnicos Desmistificados
- **Reflexão (Reflection):** Habilidade de um programa de examinar sua própria estrutura em tempo de execução. É lenta porque impede otimizações que o compilador faria antes da execução.
- **Pilha LIFO (Last-In, First-Out):** Conceito de pilha onde o último dado a entrar é obrigatoriamente o primeiro a sair.
- **Operações Atômicas (Atomic Operations):** Instruções de CPU de baixo nível que são executadas de forma indivisível, eliminando a necessidade de travas pesadas (locks) para operações de leitura e escrita simples.
