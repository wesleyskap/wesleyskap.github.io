---
title: "Máquina de Estados de Erros: Desenhando Dead-Letter Queues (DLQ) e Retries com Jitter"
excerpt: "Sistemas distribuídos falham de maneiras imprevisíveis. Aprenda como o onkai-unified-bus implementa políticas seguras de retry com recuo exponencial e isolamento de mensagens corrompidas."
category: "Mensageria"
date: "27 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## A Diferença Entre Erros Temporários e Definitivos

Quando um consumidor falha em processar um evento, a pior decisão a tomar é tentar reprocessá-lo infinitamente de imediato. Se o erro for causado por uma oscilação temporária de rede (erro temporário), um processamento imediato repetido irá sobrecarregar ainda mais o serviço parceiro. Se o erro for causado por dados corrompidos na mensagem ou validação de esquema inválida (erro definitivo), repetir a operação causará um travamento lógico do consumidor e desperdiçará recursos valiosos da CPU.

Para gerenciar essas situações, o **onkai-unified-bus** adota uma máquina de estados de erros robusta, utilizando **Retries com Backoff Exponencial e Jitter** acoplados a uma **Dead-Letter Queue (DLQ)**.

## Algoritmo de Retry com Recuo Exponencial e Jitter

Para evitar que dezenas de consumidores desconectados tentem se reconectar ou reenviar requisições exatamente no mesmo milissegundo (gerando o chamado efeito manada), adicionamos uma variação aleatória de tempo (Jitter) combinada com um aumento exponencial no intervalo entre cada tentativa de reenvio.

```go
func CalculateBackoff(attempt int, baseDelay, maxDelay time.Duration) time.Duration {
	// Cálculo exponencial: base * 2^attempt
	backoff := float64(baseDelay) * math.Pow(2, float64(attempt))
	duration := time.Duration(backoff)
	if duration > maxDelay {
		duration = maxDelay
	}
	// Adiciona Jitter (ruído aleatório) de +/- 10% para dispersar a carga
	jitter := rand.Float64() * 0.2 - 0.1
	duration = time.Duration(float64(duration) * (1.0 + jitter))
	return duration
}
```

## Isolamento de Falhas com Dead-Letter Queue (DLQ)

Se uma mensagem atinge o número máximo de tentativas de reprocessamento permitidas (ex: 5 tentativas) sem sucesso, ela é promovida à categoria de falha lógica insolúvel. Para evitar o bloqueio dos demais itens da fila, o barramento sequestra o evento problemático, anexa o histórico de stack trace de erros aos seus cabeçalhos e o publica em uma fila de isolamento denominada **Dead-Letter Queue (DLQ)**.

A partir da DLQ, as mensagens problemáticas podem ser inspecionadas manualmente por engenheiros de suporte ou reprocessadas por ferramentas administrativas após a correção do bug de negócios raiz.

### Termos Técnicos Desmistificados
- **Dead-Letter Queue (DLQ):** Uma fila dedicada para armazenar mensagens que não puderam ser entregues ou processadas com sucesso pelos consumidores.
- **Efeito Manada (Thundering Herd):** Ocorre quando um grande número de processos concorrentes acorda simultaneamente para processar o mesmo evento ou recurso, sobrecarregando o sistema.
- **Jitter:** Introdução proposital de pequenas variações de tempo aleatórias para evitar sincronização indesejada de processos distribuídos.
