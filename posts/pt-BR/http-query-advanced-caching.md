---
title: "Mecânica Avançada de Cache, Normalização de Corpo e Segurança no HTTP QUERY"
excerpt: "Aprofunde-se na Seção 2.7 e 4 do RFC 10008. Entenda os desafios de gerar chaves de cache estáveis para corpos de requisições, as regras de normalização de payloads (+json) e as diretrizes cruciais de segurança contra ataques de negação de serviço."
category: "Web"
date: "22 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "http-query-series"
seriesIndex: 5
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---

## Caching de Corpo: O Grande Desafio do Roteamento na Web

No ecossistema HTTP tradicional, o cache é simples: a chave de busca (Cache Key) é mapeada diretamente a partir da URI (ex: `GET /users?id=123`). Se os caracteres da URI forem idênticos, o proxy de borda (como Cloudflare, Fastly ou Varnish) assume que a requisição é a mesma e devolve a resposta cacheada.

Com a chegada do método **HTTP QUERY** (RFC 10008), que permite enviar payloads complexos no corpo da requisição de forma segura e idempotente, surge um grande dilema: **como cachear eficientemente requisições com base em seus corpos?**

Um único espaço em branco extra, uma quebra de linha diferente (CRLF vs LF), chaves JSON fora de ordem ou compressões distintas (Gzip vs Brotli) no corpo da requisição QUERY gerariam chaves de cache completamente diferentes para a mesma consulta semântica. 

Neste quinto post da série, analisamos as regras avançadas da **Seção 2.7 do RFC 10008** para normalização de cache keys e os requisitos de segurança essenciais para proteger sua infraestrutura.

---

## 1. Como Funciona a Geração da Cache Key no QUERY

Conforme especificado pelo RFC, a chave de cache para uma requisição `QUERY` **deve** incorporar tanto os metadados clássicos da requisição (URI, cabeçalho Vary) quanto o conteúdo bruto do corpo.

Para evitar que pequenas diferenças na representação de bytes invalidem o cache, a especificação permite que proxies e servidores intermediários apliquem **normalizações semânticas** antes de computar o hash da chave de cache:

```
[Corpo da Requisição QUERY]
          │
          ▼
┌──────────────────────────────────┐
│   Normalização do RFC 10008      │
│   - Remove Content-Encoding      │
│   - Normaliza espaçamentos (+json)│
│   - Ordena propriedades (opcional)│
└──────────────────────────────────┘
          │
          ▼
[Corpo Higienizado/Padronizado]
          │
          ▼
┌──────────────────────────────────┐
│  Geração de Hash MD5/SHA-256     │
└──────────────────────────────────┘
          │
          ▼
  [Cache Key Estável]
```

### Principais Regras de Normalização do RFC:

1. **Remoção de Codificação de Conteúdo (`Content-Encoding`):** Os proxies de cache devem descompactar o payload (ex: desinflar Gzip ou Brotli) antes de gerar a chave de cache. Duas consultas idênticas — uma enviada compactada e outra em texto puro — devem resultar na mesma chave de cache.
2. **Normalização baseada em Sufixo de Mídia (`+json`, `+xml`):** Se o Content-Type contiver um sufixo estruturado como `application/jsonpath+json`, o cache pode usar seu conhecimento das convenções do formato para eliminar espaços em branco insignificantes, quebras de linha e normalizar a ordenação das chaves de objetos.
3. **Normalização Semântica customizada:** O servidor de aplicação ou gateway de API pode normalizar chaves e valores com base na semântica do endpoint específico (ex: ignorar campos nulos ou definir valores padrão).

> [!IMPORTANT]
> A normalização feita pelo proxy ocorre **apenas na geração da Cache Key interna**. O corpo original da requisição HTTP enviado para o servidor de aplicação jamais deve ser modificado pelo intermediário.

### A Diretiva `no-transform`
Se um cliente desejar que o proxy não faça qualquer normalização ou modificação na representação do payload para fins de chaveamento de cache, ele pode enviar a diretiva clássica de cache `Cache-Control: no-transform`.

---

## 2. QUERY vs Range Requests: A Visão do RFC

A Seção 2.8 do RFC discute o comportamento de **Range Requests** (pedidos de leitura parcial de arquivos por frações de bytes) aplicados ao método `QUERY`.

O IETF concluiu que a paginação por bytes brutos traz baixíssimo valor para consultas dinâmicas estruturadas (como SQL ou JSONPath):
* O fatiamento por bytes de um JSON dinâmico pode corromper a sintaxe final no cliente (cortando chaves ao meio).
* Se a base de dados mudar entre as requisições de fatias, os dados reconstruídos no cliente ficarão corrompidos.

**Recomendação do RFC:** A paginação em endpoints `QUERY` deve ser sempre implementada **internamente na DSL de consulta** (ex: passando parâmetros como `limit` e `offset` no payload JSON, ou utilizando paginação baseada em cursores/tokens), delegando a paginação à lógica de aplicação e nunca ao fatiamento de bytes HTTP.

---

## 3. Considerações de Segurança (Seção 4)

Permitir que usuários externos enviem payloads dinâmicos arbitrários no corpo de requisições de leitura introduz novos vetores de ataque que devem ser mitigados na camada de arquitetura.

### I. Injeção de Queries (Query Injection)
Assim como consultas GET via query params são vulneráveis a SQL Injection, payloads de busca no corpo de um `QUERY` também o são.
* **Mitigação:** Nunca concatene strings de payloads JSON diretamente em comandos SQL ou JSONPath no servidor de banco de dados. Utilize *Parameterized Queries* ou ORMs robustos.

### II. Ataques de Exaustão de CPU (Parser Bomb & ReDoS)
Formatos ricos (como XML ou JSON altamente aninhados) podem ser abusados para travar o parser do servidor de aplicação (ex: *Billion Laughs Attack* em XML, ou recursões infinitas de colchetes em JSON).
* **Mitigação:** Configure limites estritos de profundidade máxima de aninhamento no parser JSON/XML do seu gateway de APIs (comumente limitando a no máximo 10 a 15 níveis) e limites de tamanho máximo de payload (ex: rejeitar qualquer corpo de `QUERY` maior que 64KB).

### III. Envenenamento de Cache (Cache Poisoning)
Se um proxy de cache normalizar payloads de forma inadequada ou diferente da lógica aplicada pelo servidor de destino, um atacante pode enviar uma query maliciosa que gera a mesma Cache Key de uma query legítima, sobrescrevendo a resposta cacheada com dados incorretos.
* **Mitigação:** Certifique-se de que as regras de normalização de JSON implementadas nos proxies de borda (CDN) estejam estritamente alinhadas e testadas com o comportamento de parsing do servidor de destino.

---

## Conclusão

O HTTP `QUERY` é a resposta definitiva para buscas seguras e escaláveis na web, mas exige responsabilidade na implementação das camadas de caching e segurança. Ao implementar regras de normalização robustas para cache keys e blindar seus parsers contra payloads abusivos, você garante um sistema distribuído de altíssima performance livre de gargalos estruturais.
