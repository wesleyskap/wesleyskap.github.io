---
title: "Visualização local vs. produção:Formatadores ANSI coloridos e auto-monitoramento de logs"
excerpt: "Logs JSON são excelentes para máquinas, mas horríveis de ler no terminal em desenvolvimento. Veja como implementar formatação ANSI colorida em Go."
category: "Alta Performance"
date: "15 de Maio, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "orkai-observability-series"
seriesIndex: 14
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---
## A diferença de ambientes e necessidades de logs

Em ambientes de produção Kubernetes, os logs da aplicação devem ser estruturados em objetos JSON puros de linha única. Isso permite que indexadores e coletores automatizados de log filtrem e parseiem as métricas com máxima velocidade e baixo uso de CPU.

Contudo, durante o desenvolvimento local (`localhost`), monitorar logs JSON brutos no terminal é uma experiência caótica para a engenharia. As strings de bytes se sobrepõem e dificultam a identificação rápida do nível da falha (`INFO`, `WARN`, `ERROR`).

Para resolver isso, o **orkai-observability** introduz um formatador de console colorido baseado em **Códigos de Escape ANSI** para desenvolvimento local, pareado com métricas internas de monitoramento da própria saúde do motor de logs.

## O design do formatter ANSI

Quando a aplicação detecta o ambiente local (`Environment == "dev"`), o logger contorna a serialização JSON crua e passa a estruturar as strings aplicando cores ANSI dinâmicas correspondentes a cada nível de severidade:

```go
package main

import (
	"fmt"
	"time"
)

const (
	ansiReset  = "\033[0m"
	ansiRed    = "\033[31m"
	ansiYellow = "\033[33m"
	ansiGreen  = "\033[32m"
	ansiCyan   = "\033[36m"
)

// FormatColorConsole formata o log em uma string colorida legível para o terminal local
func FormatColorConsole(level, msg string, fields map[string]string) string {
	timestamp := time.Now().Format("15:04:05.000")
	var color string

	switch level {
	case "INFO":
		color = ansiGreen
	case "WARN":
		color = ansiYellow
	case "ERROR":
		color = ansiRed
	default:
		color = ansiCyan
	}

	fieldsStr := ""
	for k, v := range fields {
		fieldsStr += fmt.Sprintf(" %s%s%s=%s", ansiCyan, k, ansiReset, v)
	}

	return fmt.Sprintf("%s %s[%-5s]%s %s%s\n", 
		timestamp, color, level, ansiReset, msg, fieldsStr,
	)
}
```

## Auto-monitoramento (self-monitoring)

Além de estilizar a saída visual, o motor de logs monitora sua própria integridade computacional. Ele expõe contadores internos de telemetria cruciais para monitorar saturações na produção:
- **`observability_dropped_logs_total`:** Rastreia quantos logs foram descartados sob políticas rígidas de throttling.
- **`observability_async_buffer_saturation_ratio`:** Mede a taxa média de ocupação do canal de gravação em background.

### Termos técnicos desmistificados
- **ANSI Escape Codes:** Padrão de sinalização em computação que utiliza sequências especiais de caracteres em terminais de texto para controlar cores, posições de cursor e formatação de fonte.
- **Self-Monitoring:** Padrão de design de sistemas onde uma biblioteca expõe telemetria interna sobre seu próprio consumo de memória, falhas e performance.
- **Throttling:** Controle preventivo de vazão aplicado para limitar a taxa de execução de um processo para proteger o sistema contra sobrecargas.
