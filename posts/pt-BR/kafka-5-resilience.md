---
title: "Resiliência em Telemetria: Isolando Ruídos com Retry Topics e DLQ"
excerpt: "Aprenda a tratar falhas de sensores e payloads ruidosos sem causar Head-of-Line Blocking. Desenhe um fluxo resiliente de retries com recuo e DLQ em Node.js."
category: "Resiliência"
date: "23 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Perigo do Bloqueio de Partição (Head-of-Line Blocking)

Se um sensor de ECG apresentar um defeito físico e começar a enviar dados corrompidos (ex: valores de voltagem nulos ou fora do padrão biológico), nosso consumidor falhará ao tentar processá-lo. 

Se implementarmos um bloco `try/catch` tradicional que repete a operação indefinidamente até dar certo, o consumo daquela partição inteira será paralisado. Nenhum outro paciente cujos dados estejam na mesma partição terá suas leituras processadas. Isso é chamado de **Head-of-Line Blocking**.

Em sistemas críticos, o processamento de sinais ruidosos ou falhas temporárias de APIs externas deve ser resolvido usando uma estratégia resiliente de **Retry Topics** e **Dead Letter Queues (DLQ)**.

---

## A Arquitetura do Fluxo de Recuperação

Em vez de travar a fila, implementaremos o seguinte fluxo assíncrono:

1. O consumidor lê do tópico principal `teste.ecg.raw`.
2. Se o sinal falhar devido a um erro de validação (ruído crítico), ele publica a mensagem no tópico `teste.ecg.dlq` e realiza o commit da mensagem original para continuar lendo os dados saudáveis.
3. Se a falha for temporária (ex: timeout de rede com a API de análise), o consumidor publica o sinal no tópico `teste.ecg.retry-5s` com um cabeçalho incrementado (`x-retry-count`).
4. Um consumidor específico do tópico de retry lerá a mensagem, esperará o tempo de backoff (5 segundos) e tentará novamente. Se esgotar as tentativas (ex: 3 vezes), o sinal vai para a DLQ.

```
[Gateway de Sensores] -> teste.ecg.raw
                             | (Falha temporária)
                             v
                       teste.ecg.retry-5s (aguarda 5s)
                             | (Esgotou tentativas ou ruído grave)
                             v
                       teste.ecg.dlq
```

---

## O Script de Resiliência (`resilient-consumer.js`)

Aqui está a implementação prática dessa máquina de estados de erro usando Node.js e KafkaJS:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-resilient-service',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'medical-resilient-group' });

const TOPIC_RAW = 'teste.ecg.raw';
const TOPIC_RETRY = 'teste.ecg.retry-5s';
const TOPIC_DLQ = 'teste.ecg.dlq';

const MAX_RETRIES = 3;

// Validador biológico simples
function isSignalCorrupted(payload) {
  // Simula que ruídos com voltagem extrema acima de 5.0 mV são inválidos (falha de eletrodo)
  return payload.signal_millivolts > 5.0;
}

// Simulação de chamada de API externa
async function analyzeTelemetryAPI(payload) {
  // Simula uma falha de rede temporária se o segundo for par
  if (new Date().getSeconds() % 2 === 0) {
    throw new Error('Timeout temporário na API de Cardiologia');
  }
}

async function run() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topics: [TOPIC_RAW, TOPIC_RETRY] });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const payloadString = message.value.toString();
      const payload = JSON.parse(payloadString);
      
      // Lê metadados de tentativas anteriores do header da mensagem
      let retryCount = 0;
      if (message.headers && message.headers['x-retry-count']) {
        retryCount = parseInt(message.headers['x-retry-count'].toString(), 10);
      }

      console.log(`[Consumo] Tópico: ${topic} | Paciente: ${payload.patient_id} | Tentativa: ${retryCount}`);

      try {
        // 1. Validação de integridade do sinal (Ruído Crítico)
        if (isSignalCorrupted(payload)) {
          console.warn(`[RUÍDO DETECTADO] Sinal do paciente ${payload.patient_id} corrompido. Enviando para DLQ...`);
          await sendToDLQ(payload, 'Ruído de eletrodo acima do limite biomédico');
          await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);
          return;
        }

        // Se a mensagem vem do tópico de retry, simulamos o backoff de 5s
        if (topic === TOPIC_RETRY) {
          const timeSinceMessage = Date.now() - new Date(payload.timestamp).getTime();
          const waitTime = Math.max(0, 5000 - timeSinceMessage);
          if (waitTime > 0) {
            console.log(`[Backoff] Aguardando ${waitTime}ms antes de processar retry...`);
            await new Promise(r => setTimeout(r, waitTime));
          }
        }

        // 2. Tenta processar
        await analyzeTelemetryAPI(payload);
        console.log(`[SUCESSO] Processamento concluído para paciente: ${payload.patient_id}`);
        
        // Confirma a leitura
        await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);

      } catch (err) {
        console.error(`[ERRO] Falha no processamento. Motivo: ${err.message}`);
        
        if (retryCount >= MAX_RETRIES) {
          console.error(`[DLQ EXAUSTÃO] Tentativas esgotadas (${retryCount}/${MAX_RETRIES}). Enviando para DLQ...`);
          await sendToDLQ(payload, err.message);
        } else {
          // Incrementa e envia para o tópico de retry
          const nextRetry = retryCount + 1;
          console.log(`[RETRY] Encaminhando para tópico de retry. Tentativa: ${nextRetry}`);
          
          await producer.send({
            topic: TOPIC_RETRY,
            messages: [{
              key: message.key,
              value: JSON.stringify(payload),
              headers: {
                'x-retry-count': String(nextRetry),
                'x-original-error': err.message
              }
            }]
          });
        }

        // Commita a mensagem na fila de origem de qualquer forma para liberar a partição
        await consumer.commitOffsets([{ topic, partition, offset: (parseInt(message.offset) + 1).toString() }]);
      }
    }
  });
}

async function sendToDLQ(payload, reason) {
  await producer.send({
    topic: TOPIC_DLQ,
    messages: [{
      key: payload.patient_id,
      value: JSON.stringify(payload),
      headers: {
        'x-dead-reason': reason,
        'x-dead-timestamp': new Date().toISOString()
      }
    }]
  });
}

run().catch(console.error);
```

## Conclusão

Com essa arquitetura de retries isolados e DLQ, garantimos que nossa API Node.js continue rodando em alta velocidade mesmo se alguns eletrodos falharem ou se um servidor médico cair temporariamente. Nenhuma mensagem é perdida e os pacientes saudáveis são atendidos imediatamente.

No próximo e último artigo da série, veremos como aplicar **Exactly-Once Semantics (EOS)** por meio de transações no Kafka, ideal para a gravação definitiva de alertas clínicos.
