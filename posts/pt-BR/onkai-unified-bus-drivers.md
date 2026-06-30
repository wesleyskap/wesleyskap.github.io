---
title: "Drivers desacoplados:Abstraindo NATS, RabbitMQ e Kafka com interface unificada"
excerpt: "Como alternar entre diferentes provedores de mensageria sem alterar uma única linha da sua regra de negócio? Conheça o design de drivers desacoplados do onkai-unified-bus."
category: "Mensageria"
date: "22 de Março, 2026"
readTime: "4 min de leitura"
author: "Wesley Lima"
series: "onkai-unified-bus-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/onkai-unified-bus"
---
## O problema do acoplamento com provedores específicos

Muitas equipes de engenharia de software começam seus projetos conectando-se diretamente a uma biblioteca de mensageria específica (como a biblioteca do RabbitMQ ou o cliente do Apache Kafka). Conforme o ecossistema cresce, as necessidades mudam: talvez o Kafka seja pesado demais para microsserviços pequenos e você decida migrar para o NATS, ou precise de persistência em disco que o NATS simples não provê na mesma facilidade que o RabbitMQ.

Fazer essa transição quando o código de negócios está intimamente acoplado com as funções e tipos específicos do SDK da nuvem ou do broker de destino é um processo trabalhoso e altamente propenso a falhas.

Para evitar esse pesadelo de refatoração, o **onkai-unified-bus** introduz uma camada estruturada de abstração de drivers por trás de interfaces limpas em Go.

## Definindo a interface unificada

A chave para o desacoplamento de transporte é estabelecer contratos de comportamento coesos. A assinatura expõe o mínimo denominador comum de recursos necessários para mensageria assíncrona:

```go
type Message struct {
	ID      string
	Payload []byte
	Headers map[string]string
}

type Driver interface {
	Connect(ctx context.Context) error
	Publish(ctx context.Context, topic string, msg Message) error
	Subscribe(ctx context.Context, topic string, handler func(msg Message) error) error
	Close() error
}
```

## Gerenciando conexões e reconexões físicas

Cada driver concreto (ex: `RabbitMQDriver`, `NATSDriver`) implementa a interface acima e assume a responsabilidade de gerenciar suas próprias conexões físicas de rede. 

No driver do RabbitMQ, por exemplo, o driver deve tratar ativamente os canais de erro do broker (`amqp.Channel.NotifyClose`), disparando uma thread de monitoramento em segundo plano para tentar reconectar o cliente automaticamente em caso de queda de rede, sem expor esses detalhes internos para a camada de regra de negócio da aplicação.

```go
func (d *RabbitMQDriver) handleReconnect(ctx context.Context) {
	for {
		select {
		case <-d.closeChan:
			return
		case err := <-d.conn.NotifyClose(make(chan *amqp.Error)):
			if err != nil {
				log.Println("Conexão do RabbitMQ perdida, tentando reconectar...")
				d.reconnect(ctx)
			}
		}
	}
}
```

### Termos técnicos desmistificados
- **Interfaces em Go:** Tipos que definem assinaturas de métodos (comportamentos). Qualquer estrutura que implemente estes métodos atende implicitamente à interface.
- **Broker de Mensagens:** Um intermediário que traduz e roteia mensagens entre sistemas distribuídos (ex: RabbitMQ, NATS, Kafka).
- **Desacoplamento:** A prática de projetar componentes de software de modo que eles possuam pouca ou nenhuma dependência direta entre si.
