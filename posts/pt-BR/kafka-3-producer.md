---
title: "O Produtor de Sinais em Tempo Real: Compressão, Idempotência e Latência"
excerpt: "Configure o produtor do KafkaJS para alta vazão com ZSTD/Snappy e idempotência ativada, garantindo a integridade e entrega de streams contínuos de ECG sem duplicações."
category: "Alta Performance"
date: "21 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Desafio de Produzir Dados Biomédicos

Quando lidamos com sensores de telemetria , não podemos aceitar dois problemas clássicos em sistemas de mensagens:

1. **Perda de Pacotes (Under-delivery)**: A queda de um broker ou flutuação de rede não pode fazer com que um batimento cardíaco anômalo desapareça do log sem deixar rastros.
2. **Duplicação de Eventos (Over-delivery)**: Retransmissões brutas de rede podem fazer com que um único batimento cardíaco seja registrado duas vezes. Para um algoritmo de IA rodando na ponta, isso pode gerar falsos positivos de arritmia ou taquicardia.

Para resolver isso, vamos entender como configurar o **Idempotent Producer** e otimizar a latência de transmissão usando compressão avançada.

---

## 1. Configurações Críticas de Durabilidade e Integridade

No KafkaJS, configuramos o produtor para operar com confiabilidade máxima através de três parâmetros fundamentais:

* **`acks: -1` (ou `all`)**: O produtor aguarda a confirmação de escrita de todas as réplicas em sincronia (ISR) antes de considerar a mensagem enviada com sucesso. Isso garante tolerância absoluta a falhas físicas do broker.
* **`idempotent: true`**: Habilita o envio idempotente. Internamente, o Kafka atribui um ID exclusivo ao produtor e um número de sequência para cada mensagem. Se o produtor retransmitir a mesma mensagem devido a falhas temporárias de rede, o broker Kafka detectará o número sequencial duplicado e descartará a cópia antes de escrevê-la no log de commits.
* **`maxInFlightRequests: 5`**: Define o limite máximo de requisições de escrita que podem ser enviadas em paralelo sem confirmação de resposta. O valor recomendado para produtores idempotentes é até `5`, garantindo que a ordenação das mensagens não seja invertida em caso de retries internos.

---

## 2. Otimizando a Performance com Compressão ZSTD

Um sinal de ECG de 1 canal contendo coordenadas X/Y em tempo real gera centenas de pequenos objetos JSON. Publicar cada mensagem individualmente de forma pura gera um overhead enorme de cabeçalho TCP/IP.

No KafkaJS, podemos usar o algoritmo de compressão **ZSTD (Zstandard)** criado pelo Facebook. O ZSTD oferece um balanço perfeito para dados de telemetria: excelente taxa de compressão e velocidade extrema de descompressão.

Para habilitar compressão ZSTD no KafkaJS, é necessário importar e registrar o codec:

```javascript
const { Kafka, CompressionTypes, CompressionCodecs } = require('kafkajs');
const ZstdCodec = require('kafkajs-zstd'); // Opcional: exige instalação

CompressionCodecs[CompressionTypes.ZSTD] = ZstdCodec;
```
*(Nota: Para fins práticos e compatibilidade sem pacotes nativos adicionais em testes locais, também podemos usar `CompressionTypes.GZIP` ou `CompressionTypes.Snappy`).*

---

## 3. O Script do Produtor de Telemetria (`producer-telemetry.js`)

O código abaixo simula sensores gerando batimentos cardíacos falsos para 3 pacientes diferentes. Cada mensagem é enviada contendo uma chave de partição (`key`) equivalente ao ID do paciente, garantindo que o Kafka envie todas as ondas de um paciente específico para a mesma partição física do broker:

```javascript
const { Kafka, CompressionTypes } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ecg-sensor-gateway',
  brokers: ['localhost:9092']
});

// Criamos um produtor altamente confiável e idempotente
const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
  metadataMaxAge: 30000 // Atualiza a topologia de partições a cada 30s
});

// Simulador simples de sinal de ECG gerando o formato P-Q-R-S-T
function generateECGSample(patientId, seq) {
  // Simula um ponto de leitura bio
  const baseValue = 0.5 + Math.sin(seq * 0.1) * 0.2;
  const isRPeak = seq % 10 === 0;
  const value = isRPeak ? baseValue + 1.2 : baseValue; // Simula a onda R do complexo QRS

  return {
    patient_id: patientId,
    timestamp: new Date().toISOString(),
    sequence: seq,
    signal_millivolts: parseFloat(value.toFixed(4))
  };
}

async function startSimulation() {
  await producer.connect();
  console.log('Produtor conectado. Iniciando simulação de sensores de ECG...');

  const patients = ['patient-alpha-101', 'patient-beta-202', 'patient-gamma-303'];
  let sequenceCounter = 0;

  // Envia pacotes a cada 100ms
  setInterval(async () => {
    sequenceCounter++;
    
    // Mapeamos a mensagem a ser enviada no lote
    const messages = patients.map(patientId => {
      const payload = generateECGSample(patientId, sequenceCounter);
      
      return {
        key: patientId, // O patient_id como chave garante ordenação estrita
        value: JSON.stringify(payload)
      };
    });

    try {
      // Produção de mensagens otimizada com compressão
      const recordMetadata = await producer.send({
        topic: 'teste.ecg.raw',
        messages: messages,
        compression: CompressionTypes.GZIP // Usamos GZIP por compatibilidade nativa
      });

      console.log(`[Lote Enviado] Seq: ${sequenceCounter} | Detalhes do Roteamento:`);
      recordMetadata.forEach(meta => {
        console.log(`   - Tópico: ${meta.topicName} | Partição: ${meta.partition} | Offset: ${meta.offset}`);
      });

    } catch (err) {
      console.error('Erro crítico ao produzir sinal biomédico:', err);
    }
  }, 200);
}

startSimulation().catch(console.error);
```

---

## 4. Analisando o Roteamento das Chaves

Ao rodar o script (`node producer-telemetry.js`), observe os logs impressos no console. Você notará que:
* As mensagens do `patient-alpha-101` cairão de forma consistente **sempre na mesma partição** (ex: partição 2).
* As mensagens do `patient-beta-202` cairão em outra partição fixa (ex: partição 4).

Isso prova o funcionamento do algoritmo de hash do Kafka (`MurmurHash2`), garantindo que o histórico médico temporal de cada paciente nunca sofra inversões de ordem ou perdas de sincronismo no broker.

No próximo artigo, criaremos o **Consumidor de Telemetria**, tratando da mecânica de leitura de alto throughput, controle de memória (Backpressure) e commits manuais de offset.
