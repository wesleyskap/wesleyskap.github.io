---
title: "Desmistificando o Apache Kafka: Por que Usar em Telemetria?"
excerpt: "Entenda o conceito de Commit Log distribuído e descubra por que o Kafka é a escolha ideal para gerenciar streams de sinais biomédicos como EEG e ECG de alta frequência."
category: "Sistemas Distribuídos"
date: "19 de Julho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## A Natureza da Telemetria 

Imagine gerenciar o fluxo de dados de centenas de leitos hospitalares, onde cada paciente possui sensores de Eletrocardiograma (ECG) gerando 250 amostras por segundo, e sensores de Eletroencefalograma (EEG) gerando até 1000 amostras por segundo. 

Tentar salvar cada leitura diretamente no banco de dados relacional cria um gargalo imediato de escrita. Usar mensageria tradicional baseada em filas (como RabbitMQ ou AWS SQS) também apresenta desafios: uma vez consumida a mensagem, ela é apagada. Se você precisar reprocessar os dados com um novo algoritmo de detecção de arritmia cardíaca, os dados originais já se foram.

É aqui que o **Apache Kafka** se torna indispensável.

---

## O que é o Kafka: O Commit Log Distribuído

Ao contrário de brokers de mensagens tradicionais que agem como intermediários temporários de caixas de correio, o Kafka é estruturado como um **Commit Log Distribuído**.

1. **Gravação Sequencial Apenas (Append-Only)**: O Kafka armazena as mensagens gravando-as de forma sequencial e imutável no final de um arquivo em disco. Isso permite operações de I/O em disco extremamente rápidas (próximas ao limite do hardware), pois evita buscas aleatórias nas cabeças físicas de leitura.
2. **Mensagens Persistentes**: As mensagens não são deletadas após o consumo. Elas expiram apenas após um período de retenção configurável (ex: 7 dias) ou por tamanho total do arquivo.
3. **Consumo baseado em Ponteiros (Offsets)**: Cada consumidor é responsável por rastrear onde ele parou na leitura (o `offset`). Múltiplos consumidores podem ler o mesmo stream de dados em velocidades diferentes sem interferir um no outro.

---

## Filas Tradicionais vs. Kafka

A tabela abaixo contrasta as diferenças arquiteturais mais relevantes no contexto biomédico:

| Característica | Filas Tradicionais (RabbitMQ, SQS) | Apache Kafka (Commit Log) |
| :--- | :--- | :--- |
| **Padrão de Consumo** | Destrutivo (uma leitura apaga a mensagem). | Não destrutivo (multi-leitura e replay). |
| **Ordenação** | Difícil de garantir sob alta concorrência concorrente. | Estrita por partição (garantido pela chave). |
| **Escalabilidade** | Limitada pelo gerenciamento de estados das filas. | Escala horizontalmente adicionando partições. |
| **Reprocessamento** | Impossível se as mensagens já foram consumidas. | Totalmente suportado movendo o offset para trás. |

---

## A Anatomia Aplicada a Sinais Biomédicos

Para entender como implementaremos nossa infraestrutura e APIs a partir da Parte 2, precisamos alinhar os conceitos fundamentais:

* **Tópicos**: É o canal lógico. Teremos um tópico chamado `teste.ecg.raw` para receber os batimentos brutos.
* **Partições**: Divisões físicas de um tópico. Um tópico com 12 partições distribui o tráfego de gravação em paralelo.
* **Chave de Partição (Partition Key)**: O Kafka garante que todas as mensagens com a mesma chave caiam sempre na mesma partição. Usaremos o `patient_id` como chave. Assim, a ordem temporal dos batimentos de um paciente específico é 100% preservada na partição atribuída.
* **Grupos de Consumidores**: Vários processos de Node.js se juntam sob um mesmo ID de grupo. O Kafka balanceia as partições entre eles. Se tivermos 4 consumidores no grupo, cada um lê 3 partições de forma isolada.

---

## O Papel do Node.js na Ingestão

O ecossistema Node.js, com seu modelo assíncrono baseado em Event Loop, é excelente para lidar com operações de I/O de alta concorrência. Ele serve como o gateway perfeito: recebe os dados binários ou JSON via WebSocket/HTTP de sensores hospitalares locais e os publica de forma extremamente leve e rápida no cluster Kafka usando a biblioteca `kafkajs`.

No próximo artigo, configuraremos nosso ambiente local com Docker Compose usando a arquitetura moderna **Kafka KRaft** (sem dependência do ZooKeeper) e criaremos nosso primeiro cliente Node.js estruturando a topologia de partições.
