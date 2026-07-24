---
title: "Detecção Transacional de Anomalias: Garantias Exactly-Once (EOS) no Kafka"
excerpt: "Garanta que cada sinal de arritmia gere exatamente um alerta clínico. Veja como orquestrar transações atômicas de leitura e escrita com KafkaJS no Node.js."
category: "Mensageria"
date: "24 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "kafka-biomedical-signals-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Risco da Inconsistência em Alertas Críticos

No processamento de telemetria médica, frequentemente temos fluxos que realizam leituras e escritas sequenciais em tópicos. Por exemplo:
1. **Lê** um bloco de coordenadas brutas de ECG do tópico `biomedical.ecg.raw`.
2. **Processa** o sinal usando um algoritmo analítico. Se detectar um padrão de fibrilação atrial (arritmia), a aplicação gera um alerta.
3. **Escreve** o alerta no tópico `biomedical.alerts.critical`.
4. **Atualiza (Commit)** o offset de leitura no tópico original.

Se o servidor Node.js cair exatamente após o passo 3, mas antes do passo 4 (commit), a nova instância reiniciará e reprocessará a mesma leitura de ECG. Isso resultará em um **segundo alerta de emergência idêntico** sendo enviado para a equipe médica. Em ambientes clínicos sob estresse, alarmes duplicados geram "fadiga de alarmes" e diminuem a confiabilidade do sistema.

Para evitar isso, usamos as transações do Kafka, conhecidas como **Exactly-Once Semantics (EOS)**.

---

## Como Funciona o Exactly-Once Semantics (EOS)

O Kafka introduziu suporte a transações permitindo agrupar a produção de mensagens e a marcação de offsets de consumo em uma única unidade atômica coordenada pelo broker.

* **Idempotência**: Garante a escrita sem perdas e sem duplicidade de forma isolada.
* **Transactional ID**: Identificador único atribuído ao produtor. Isso permite que o broker neutralize instâncias antigas ("zumbis") do mesmo produtor que possam ressurgir após uma queda de rede (mecanismo de Epoch).
* **Isolation Level (`read_committed`)**: Configuração nos consumidores que indica que eles só devem ler mensagens cujas transações associadas foram finalizadas com sucesso (cometidas). Mensagens de transações abortadas são simplesmente ignoradas pelos consumidores.

---

## O Script Transacional (`transactional-detector.js`)

O código abaixo implementa um loop transacional completo de leitura e escrita. Se o sinal de ECG indicar uma arritmia simulada, ele produzirá um alerta crítico e registrará o offset do consumidor na mesma transação. Se alguma etapa falhar, toda a operação será desfeita e nenhum outro microsserviço lerá o alerta parcial:

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-anomaly-detector',
  brokers: ['localhost:9092']
});

const GROUP_ID = 'anomaly-detector-group';
const TOPIC_RAW = 'biomedical.ecg.raw';
const TOPIC_ALERTS = 'biomedical.alerts.critical';

// Criamos o produtor transacional definindo o transactionalId
const producer = kafka.producer({
  idempotent: true,
  transactionalId: 'medical-alert-tx-producer-01'
});

const consumer = kafka.consumer({
  groupId: GROUP_ID,
  // IMPORTANTE: Só lê mensagens que foram transacionadas com sucesso
  readUncommitted: false 
});

// Algoritmo simulado de detecção de arritmia
function detectArrhythmia(payload) {
  // Simula anomalia se a voltagem de pico de onda for anormal (ex: > 1.5 mV)
  return payload.signal_millivolts > 1.5;
}

async function run() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topic: TOPIC_RAW, fromBeginning: false });

  await consumer.run({
    autoCommit: false, // Desativa autocommit para controlarmos manualmente na transação
    
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      const { topic, partition } = batch;

      if (batch.messages.length === 0) return;

      console.log(`[Batch] Analisando ${batch.messages.length} leituras...`);

      // 1. Inicializa a transação no produtor
      const transaction = await producer.transaction();

      try {
        for (let message of batch.messages) {
          const payload = JSON.parse(message.value.toString());
          
          if (detectArrhythmia(payload)) {
            console.warn(`[ALERTA] Anomalia detectada no paciente ${payload.patient_id}! Valor: ${payload.signal_millivolts} mV`);

            // Produz o alerta utilizando a transação
            await transaction.send({
              topic: TOPIC_ALERTS,
              messages: [{
                key: payload.patient_id,
                value: JSON.stringify({
                  patient_id: payload.patient_id,
                  event: 'ARRHYTHMIA_DETECTED',
                  measured_value: payload.signal_millivolts,
                  detected_at: new Date().toISOString()
                })
              }]
            });
          }

          // Resolve o offset localmente em memória
          resolveOffset(message.offset);
          await heartbeat();
        }

        // 2. Envia os offsets confirmados de consumo PARA A TRANSAÇÃO.
        // O offset commitado deve ser o próximo a ser lido (offset da última mensagem + 1)
        const lastMessage = batch.messages[batch.messages.length - 1];
        const nextOffset = (parseInt(lastMessage.offset, 10) + 1).toString();

        await transaction.sendOffsets({
          consumerGroupId: GROUP_ID,
          offsets: [{ topic, partition, offset: nextOffset }]
        });

        // 3. Efetiva a transação. O Kafka grava o commit nos logs e libera
        // os alertas para consumo e consolida o offset do consumidor.
        await transaction.commit();
        console.log(`[EOS Commit] Lote transacionado com sucesso para a partição ${partition}`);

      } catch (err) {
        console.error('[EOS Abort] Erro crítico detectado. Abortando transação...', err);
        
        // Se houver qualquer falha no meio do processo, reverte todas as escritas
        await transaction.abort();
      }
    }
  });
}

run().catch(console.error);
```

---

## Conclusão da Série

Parabéns! Ao longo desta série, estruturamos uma API de telemetria médica de ponta a ponta:

1. **Parte 1**: Conceituamos o funcionamento do log sequencial do Kafka.
2. **Parte 2**: Configuramos um cluster local KRaft e provisionamos o tópico de sinais biológicos de forma programática.
3. **Parte 3**: Implementamos um produtor idempotente com compressão para streams de dados de alta concorrência.
4. **Parte 4**: Desenhamos um consumidor escalável com commits manuais de offset e backpressure nativo.
5. **Parte 5**: Criamos resiliência isolando sinais defeituosos em Retry Topics e DLQ.
6. **Parte 6**: Garantimos a confiabilidade de alertas médicos usando transações atômicas Exactly-Once (EOS).

Com essa base conceitual e prática, você está pronto para implantar microsserviços Node.js integrados ao Apache Kafka preparados para suportar cargas de dados hospitalares em tempo real em nível de produção.
