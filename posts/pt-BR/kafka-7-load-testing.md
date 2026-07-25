---
title: "Simulando Carga Massiva: Testes de Carga na Ingestão com k6 e Kafka"
excerpt: "Como estressar o pipeline de sinais médicos simulando milhares de conexões de sensores concorrentes? Escreva um script de k6 para testar os limites do Node.js e Kafka."
category: "Alta Performance"
date: "25 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "kafka-teste-signals-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-observability"
---

## O Desafio da Carga em Escala Real

Até agora, testamos nosso produtor e consumidor de telemetria  rodando scripts em segundo plano com poucos emuladores de pacientes. Mas como nossa arquitetura de microsserviços em Node.js e Apache Kafka se comportará sob estresse real?

Imagine a hora de pico em um hospital conectado: milhares de aparelhos de ECG e EEG enviando pulsos continuamente. Um atraso de processamento de poucos milissegundos na API de ingestão de sinais HTTP/HTTPS pode resultar em buffers cheios, timeouts de rede e perda de dados de monitoramento.

Para validar os limites físicos do nosso sistema antes de colocá-lo em produção, utilizaremos o **k6** (uma ferramenta de teste de carga moderna, open-source e escrita em Go que executa scripts em JavaScript) para simular grandes cargas de telemetria.

---

## 1. Construindo a API de Ingestão de Alta Performance (`ingestion-api.js`)

Para aguentar o teste de carga massivo, utilizaremos o **Fastify** no Node.js em vez do Express. O Fastify possui um overhead de roteamento quase nulo e é ideal para lidar com dezenas de milhares de requisições por segundo.

Primeiro, instale as dependências:
```bash
npm install fastify kafkajs
```

Aqui está o código da nossa API de Ingestão (`server.js`):

```javascript
const fastify = require('fastify')({ logger: false });
const { Kafka, CompressionTypes } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'medical-ingestion-api',
  brokers: ['localhost:9092']
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5
});

// Endpoint que recebe o stream do sinal biomédico do eletrodo
fastify.post('/api/v1/telemetry', async (request, reply) => {
  const { patient_id, signal_millivolts, sequence } = request.body;

  if (!patient_id || signal_millivolts === undefined) {
    return reply.status(400).send({ error: 'Payload incompleto.' });
  }

  try {
    // Produção rápida utilizando o paciente como chave para garantir ordenação
    await producer.send({
      topic: 'teste.ecg.raw',
      compression: CompressionTypes.GZIP,
      messages: [{
        key: patient_id,
        value: JSON.stringify({
          patient_id,
          signal_millivolts,
          sequence,
          timestamp: new Date().toISOString()
        })
      }]
    });

    return reply.status(202).send({ status: 'ACCEPTED' }); // 202 Accepted indica processamento assíncrono
  } catch (err) {
    return reply.status(500).send({ error: 'Falha interna ao enfileirar sinal.' });
  }
});

async function start() {
  await producer.connect();
  console.log('Produtor Kafka conectado.');
  
  await fastify.listen({ port: 3000 });
  console.log('Fastify API de Ingestão rodando na porta 3000.');
}

start().catch(console.error);
```

---

## 2. Escrevendo o Script de Teste de Carga do k6 (`k6-load-test.js`)

Nosso teste de carga com o k6 simulará um cenário de rampa:
1. **Ramp-up (0 a 30s)**: Aumenta gradualmente de 0 para **200 usuários virtuais concorrentes (VUs)**.
2. **Platô de Carga (30s a 1m30s)**: Mantém 200 VUs gerando batimentos cardíacos simulados ininterruptamente.
3. **Ramp-down (1m30s a 2m)**: Reduz gradualmente o tráfego a zero para avaliar a recuperação do coletor.

Crie o arquivo `k6-load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // Rampa para 200 sensores concorrentes
    { duration: '1m', target: 200 },  // Mantém estresse por 1 minuto
    { duration: '30s', target: 0 },    // Desaceleração
  ],
  thresholds: {
    // Definimos critérios de qualidade (SLA)
    http_req_duration: ['p(95)<50', 'p(99)<150'], // 95% das requisições devem responder em menos de 50ms
    http_req_failed: ['rate<0.01'],               // Menos de 1% de erros HTTP permitidos
  },
};

export default function () {
  // Simula IDs de pacientes aleatórios de uma lista de 500 pacientes únicos
  const patientId = `patient-k6-${randomIntBetween(1, 500)}`;
  const signalValue = parseFloat((Math.random() * 2.0).toFixed(4));
  const sequence = __ITER; // Iteração global do k6 como contador de sequências

  const payload = JSON.stringify({
    patient_id: patientId,
    signal_millivolts: signalValue,
    sequence: sequence
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Dispara a requisição HTTP POST para nossa API Fastify
  const res = http.post('http://localhost:3000/api/v1/telemetry', payload, params);

  // Valida que o servidor retornou código 202 (Accepted)
  check(res, {
    'status é 202': (r) => r.status === 202,
  });

  // Cada dispositivo simulado envia dados em intervalos de aproximadamente 100ms
  sleep(0.1);
}
```

---

## 3. Executando o Teste de Carga

Com a API Fastify (`node server.js`) e o Docker com Kafka rodando, execute o k6 apontando para o script:

```bash
k6 run k6-load-test.js
```

---

## 4. O que Observar nos Resultados?

Ao final do teste, o k6 exibirá um relatório consolidado no terminal. Atente-se às seguintes métricas críticas:

* **`http_req_duration`**: A latência de ponta a ponta da API. Em pipelines de telemetria , latências p(99) acima de 150ms indicam gargalo na escrita do produtor do Kafka ou falta de threads de processamento no Node.js.
* **`http_req_failed`**: Se essa taxa subir acima de 0%, verifique se o Kafka não atingiu os limites de memória ou se o pool de conexões TCP da API Fastify esgotou.
* **Consumer Lag (Atraso do Consumidor)**: Enquanto o teste de carga envia milhares de mensagens, rode no terminal:
  ```bash
  docker exec -it medical-kafka-kraft kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group medical-ecg-analysis-group
  ```
  Isso mostrará a distância (Lag) entre o offset produzido e o offset consumido. Se o lag subir infinitamente, significa que sua camada de consumo precisa de mais instâncias de Node.js rodando em paralelo para dar conta do volume ingerido.

## Conclusão

Realizar testes de carga frequentes com k6 ajuda a calibrar a topologia do Kafka (aumentar partições) e ajustar configurações de pooling TCP e limites de payload no Node.js. Agora você tem um pipeline completo, seguro, resiliente e testado contra sobrecarga física de sinais hospitalares em tempo real.
