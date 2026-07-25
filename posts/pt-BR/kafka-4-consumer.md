---
title: "O Consumidor de Telemetria: Processamento Contínuo e Janelas de Tempo"
excerpt: "Implemente um consumidor Node.js robusto com controle de backpressure, commits manuais de offset e gerenciamento de rebalanceamentos durante a ingestão de telemetria ."
category: "Mensageria"
date: "22 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Desafio do Consumo em Tempo Real

Receber milhões de batimentos cardíacos é apenas metade do trabalho. A outra metade é processá-los com segurança. 

Diferente de sistemas tradicionais onde o broker empurra as mensagens diretamente, no Kafka o consumidor busca os dados ativamente (**Pull Model**). Isso nos dá total controle sobre o fluxo, permitindo mitigar problemas críticos de consumo:

1. **Perda de offsets (At-least-once vs. At-most-once)**: Se o Node.js confirmar o recebimento antes de registrar a mensagem no banco de dados e cair logo em seguida, os sinais biológicos daquele período serão perdidos permanentemente.
2. **Estouro de memória (Out of Memory - OOM)**: Se a velocidade de ingestão do Kafka for maior que a capacidade da nossa aplicação de processar e persistir os dados no banco, a memória do Node.js ficará saturada.

---

## 1. Ajuste Fino das Configurações do Consumer

No KafkaJS, configuramos o consumidor para ler dados de forma otimizada ajustando os limites de busca:

* **`maxBytesPerPartition`**: Define a quantidade máxima de dados que o broker pode retornar por partição em cada busca. O valor padrão de 1MB é seguro, mas para fluxos densos, reduzir para `500KB` ajuda a diminuir os picos de heap do Node.js.
* **`maxWaitTimeInMs`**: Tempo máximo que o broker aguarda para acumular dados se o limite mínimo (`minBytes`) de busca ainda não foi atingido.
* **Desativar `autoCommit: false`**: Faremos o commit manual dos offsets apenas após termos certeza de que os dados do sinal do paciente foram devidamente validados e enfileirados para gravação.

---

## 2. Lidando com Rebalanceamentos do Consumer Group

Quando escalamos nossa API Node.js (ex: iniciando novas instâncias no Kubernetes), o Kafka dispara um **rebalanceamento**. Ele pausa o consumo temporariamente e redistribui as partições de forma equilibrada entre os consumidores disponíveis.

Se o rebalanceamento demorar demais, a aplicação pode ser expulsa do grupo. Por isso, ajustamos:
* **`sessionTimeout`**: Tempo limite para o broker considerar o consumidor morto se ele parar de enviar heartbeats (ex: 30 segundos).
* **`rebalanceTimeout`**: Tempo que o consumidor tem para processar as mensagens pendentes e aceitar a nova partição (ex: 60 segundos).

---

## 3. O Script do Consumidor Resiliente (`consumer-telemetry.js`)

Aqui está o código do consumidor Node.js que assina o tópico `teste.ecg.raw`, processa os sinais médicos simulando latência de persistência em banco e realiza commits manuais em blocos:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ecg-processor',
  brokers: ['localhost:9092']
});

// Criamos o consumidor associado ao grupo de processamento de ECG
const consumer = kafka.consumer({
  groupId: 'medical-ecg-analysis-group',
  sessionTimeout: 30000,
  rebalanceTimeout: 60000,
  heartbeatInterval: 10000 // Envia heartbeats ao broker a cada 10s
});

// Banco de dados simulado (tempo de inserção de 50ms)
const saveToDatabase = async (payload) => {
  return new Promise(resolve => setTimeout(resolve, 50));
};

async function run() {
  await consumer.connect();
  console.log('Consumidor conectado ao cluster.');

  // Nos inscrevemos no tópico a partir do offset mais recente por padrão
  await consumer.subscribe({ topic: 'teste.ecg.raw', fromBeginning: false });

  // Escutando eventos do ciclo de vida para auditoria de infraestrutura
  consumer.on(consumer.events.GROUP_JOIN, (e) => {
    console.log(`[Lifecycle] Consumidor entrou no grupo. Partições atribuídas:`, e.payload.memberAssignment);
  });

  consumer.on(consumer.events.REBALANCING, () => {
    console.log('[Lifecycle] Grupo em rebalanceamento detectado. Pausando consumo...');
  });

  // Iniciamos a engine de consumo
  await consumer.run({
    autoCommit: false, // Desativa o commit automático para garantir entrega "At-Least-Once"
    
    // Processamento em lote para otimizar I/O
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
      console.log(`[Novo Lote] Recebidas ${batch.messages.length} mensagens da partição ${batch.partition}`);

      for (let message of batch.messages) {
        const payload = JSON.parse(message.value.toString());
        
        // Simulação de processamento médico / análise de ruídos
        console.log(`   - Paciente: ${payload.patient_id} | Voltagem: ${payload.signal_millivolts} mV | Seq: ${payload.sequence}`);
        
        // Salva os dados no banco de dados analítico
        await saveToDatabase(payload);

        // Marca a mensagem como lida em memória
        resolveOffset(message.offset);
        
        // Notifica o coordenador do Kafka que a aplicação está viva
        await heartbeat();
      }

      // Realiza o commit dos offsets processados do lote de volta para o broker
      await commitOffsetsIfNecessary();
      console.log(`[Lote Processado] Offsets da partição ${batch.partition} persistidos no Kafka.`);
    }
  });
}

run().catch(console.error);
```

---

## 4. O Mecanismo de Backpressure no Node.js

Ao usar o método `eachBatch` do KafkaJS em conjunto com `autoCommit: false`, o fluxo de busca de novas mensagens é interrompido até que a promessa do lote anterior seja resolvida. 

Se o banco de dados começar a responder com lentidão, o laço `for (let message of batch.messages)` demorará mais tempo para finalizar. Isso atrasa o retorno do `eachBatch`, forçando o KafkaJS a esperar antes de pedir o próximo lote ao broker. O consumo entra em um ritmo natural ditado pelo gargalo físico do banco, impedindo que o Node.js acumule gigabytes de mensagens na memória.

No próximo artigo, abordaremos resiliência avançada: como isolar batimentos com ruído em uma **Dead Letter Queue (DLQ)** e tratar indisponibilidades com **Retry Topics dinâmicos** sem paralisar o consumo dos pacientes saudáveis.
