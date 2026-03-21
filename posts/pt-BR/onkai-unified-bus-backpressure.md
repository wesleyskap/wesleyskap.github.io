---
title: "Controle de Fluxo e Backpressure: Evitando Saturação de Memória no Consumo de Eventos"
excerpt: "O que fazer quando os consumidores não conseguem acompanhar a velocidade dos produtores? Aprenda a desenhar estratégias de backpressure resilientes usando buffers não-bloqueantes no Go."
category: "Mensageria"
date: "21 de Março, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---

## O Fenômeno da Saturação de Consumo

Em qualquer arquitetura distribuída ou orientada a eventos, a disparidade de velocidade entre produtores e consumidores é inevitável. Se o seu serviço produtor gera 50.000 mensagens por segundo, mas o seu banco de dados ou API downstream integrada no consumidor só consegue processar 5.000 requisições por segundo, a memória do sistema se tornará rapidamente um ponto de falha. Sem um controle de fluxo estruturado, os buffers locais acumularão dados indefinidamente até causar um travamento por falta de memória (Out Of Memory - OOM).

Para blindar a aplicação contra esses picos de tráfego, o **onkai-unified-bus** implementa políticas robustas de **Backpressure** (contrapressão) e buffers circulares não-bloqueantes.

## Estratégias de Controle: Bloqueio vs. Descarte

Quando um canal de recepção de eventos atinge seu limite de capacidade máxima (saturação), o barramento oferece duas políticas principais configuráveis:

1.  **Block (Bloqueio Reverso):** A goroutine produtora é temporariamente pausada ao tentar publicar novos eventos. Isso reduz a taxa de produção naturalmente até que os consumidores esvaziem a fila.
2.  **Drop (Descarte Inteligente):** O barramento descarta a mensagem mais antiga (Drop Oldest) ou a mais nova (Drop Newest) para manter a integridade da aplicação e evitar o aumento da latência geral.

```go
type BackpressurePolicy int

const (
	PolicyBlock BackpressurePolicy = iota
	PolicyDropOldest
	PolicyDropNewest
)

func (b *Bus) Publish(topic string, data []byte, policy BackpressurePolicy) error {
	select {
	case b.inbox <- data:
		return nil
	default:
		switch policy {
		case PolicyBlock:
			b.inbox <- data // Bloqueia a goroutine produtora até liberar espaço
			return nil
		case PolicyDropOldest:
			select {
			case <-b.inbox: // Descarta o item mais antigo da fila
			default:
			}
			b.inbox <- data // Insere o novo dado
			return nil
		case PolicyDropNewest:
			// Descarta o dado atual e retorna erro informativo de saturação
			return ErrQueueSaturated
		}
	}
	return nil
}
```

## Buffers Circulares Baseados em Canais

Aproveitando a estrutura nativa de canais buferizados do Go (`buffered channels`), o barramento executa estas verificações de forma extremamente eficiente sem a necessidade de travas complexas ou estruturas adicionais lentas. O uso inteligente do bloco de seleção (`select/case`) sem canal default permite que a decisão de aplicação de backpressure ocorra em nível de CPU em nanosegundos.

### Termos Técnicos Desmistificados
- **Backpressure (Contrapressão):** A resistência ou força exercida em oposição ao fluxo de dados, obrigando o sistema de envio a reduzir sua taxa de transmissão.
- **Out Of Memory (OOM):** Um estado crítico em que o sistema operacional finaliza um processo porque este consumiu toda a memória física disponível.
- **Canais Buferizados (Buffered Channels):** Filas nativas da linguagem Go com capacidade limitada predefinida que permitem o envio de mensagens sem bloquear o remetente até que o buffer esteja cheio.
