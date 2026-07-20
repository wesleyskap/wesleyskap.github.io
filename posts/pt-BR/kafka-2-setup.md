---
title: "Ingestão de Sinais Biomédicos: Infraestrutura KRaft e Topologia de Partições"
excerpt: "Como planejar a distribuição e chaveamento de partições para garantir ordenação estrita por paciente? Configure um cluster Kafka KRaft e inicialize o cliente Node.js."
category: "Sistemas Distribuídos"
date: "20 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "kafka-biomedical-signals-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## Introdução

No artigo anterior, vimos que o Kafka armazena streams de dados de forma ordenada e imutável. Agora, vamos erguer nossa infraestrutura local usando a arquitetura moderna **KRaft** (Kafka Raft Metadata Mode), que elimina de vez a necessidade do Apache ZooKeeper, simplificando a topologia de implantação e reduzindo o consumo de recursos.

Além disso, programaremos a inicialização do cliente `kafkajs` no Node.js e aprenderemos a planejar e criar nossos tópicos de sinais biomédicos sob medida.

---

## 1. Subindo a Infraestrutura com Docker Compose (KRaft)

Crie um arquivo chamado `docker-compose.yml` para rodar o Kafka localmente com o broker exposto na porta `9092`:

```yaml
version: '3.8'

services:
  kafka:
    image: confluentinc/cp-kafka:7.4.0
    container_name: medical-kafka-kraft
    ports:
      - "9092:9092"
    environment:
      # Habilita o modo KRaft (sem ZooKeeper)
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:29093'
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
      KAFKA_LOG_DIRS: '/tmp/kraft-combined-logs'
      # Configuração padrão de limpeza de logs (Cluster-wide)
      KAFKA_LOG_RETENTION_HOURS: 24 # Mantém dados por apenas 24h em ambiente local
      KAFKA_LOG_SEGMENT_BYTES: 104857600 # 100MB por segmento de log
```

Inicie o container rodando no terminal:
```bash
docker compose up -d
```

---

## 2. Inicializando o Projeto Node.js

Crie um diretório de testes e instale o pacote `kafkajs`:

```bash
mkdir medical-telemetry-ingestion
cd medical-telemetry-ingestion
npm init -y
npm install kafkajs
```

---

## 3. Topologia e Configuração Fina do Tópico

Para receber dados massivos de telemetria biológica, não devemos criar tópicos com as configurações genéricas padrão do Kafka. Precisamos de parâmetros que respeitem o ciclo de vida dos sinais:

1. **Partições**: Teremos pelo menos `6 partições` para permitir que o tráfego de gravação de centenas de sensores hospitalares seja distribuído concorrentemente.
2. **Segmentação de Arquivo (`segment.bytes`)**: Diminuiremos o tamanho do segmento do log para `10MB` (o padrão do Kafka é 1GB). Como sinais de ECG geram dados constantes, isso força a rotação dos arquivos e permite que a retenção remova os dados antigos mais rapidamente, evitando saturação de disco.
3. **Retenção (`retention.ms`)**: Definiremos a retenção para `12 horas` (43.200.000 ms). Os dados de sinais biológicos em tempo real são consumidos em poucos segundos; manter um histórico longo no broker é desnecessário se salvarmos os históricos pós-processados em bancos de séries temporais (como InfluxDB ou TimescaleDB).

---

## 4. O Script de Inicialização da Infraestrutura (`setup-infrastructure.js`)

Aqui está o código em Node.js que conecta ao cluster e provisiona nossos tópicos biomédicos utilizando o cliente administrativo do KafkaJS:

```javascript
const { Kafka } = require('kafkajs');

// 1. Inicializa o cliente básico do Kafka
const kafka = new Kafka({
  clientId: 'medical-signal-admin',
  brokers: ['localhost:9092'],
  connectionTimeout: 5000, // Timeout de 5s para estabelecer conexão TCP
  requestTimeout: 25000,    // Timeout de 25s para receber respostas das requisições
  retry: {
    initialRetryTime: 300,  // Aguarda 300ms antes de tentar novamente após falha
    retries: 5              // Número máximo de retries por requisição falha
  }
});

const admin = kafka.admin();

async function bootstrap() {
  console.log('Conectando ao cluster Kafka...');
  await admin.connect();
  console.log('Conectado com sucesso!');

  const topicName = 'biomedical.ecg.raw';

  // Lista os tópicos existentes
  const existingTopics = await admin.listTopics();
  
  if (existingTopics.includes(topicName)) {
    console.log(`O tópico "${topicName}" já existe. Pulando criação.`);
  } else {
    console.log(`Criando tópico "${topicName}" com configurações otimizadas...`);
    
    await admin.createTopics({
      topics: [{
        topic: topicName,
        numPartitions: 6, // 6 partições distribuindo o tráfego por paciente
        replicationFactor: 1, // 1 réplica apenas para ambiente local de testes
        configEntries: [
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'retention.ms', value: '43200000' }, // Retém dados por 12 horas
          { name: 'segment.bytes', value: '10485760' }  // Segmentos de 10MB para rotação rápida
        ]
      }]
    });
    
    console.log(`Tópico "${topicName}" criado com sucesso!`);
  }

  await admin.disconnect();
  console.log('Conexão administrativa encerrada.');
}

bootstrap().catch(console.error);
```

Execute o script para provisionar a topologia:
```bash
node setup-infrastructure.js
```

## Conclusão

Agora que temos nossa infraestrutura configurada e o tópico `biomedical.ecg.raw` criado com a topologia correta, estamos prontos para produzir dados biológicos reais. 

No próximo artigo, implementaremos um **Producer de Sinais Biomédicos em Tempo Real**, focando em configurações fundamentais como **idempotência de produtor** para evitar duplicações de batimentos cardíacos e **compressão ZSTD** para compactar os pacotes de dados biológicos.
