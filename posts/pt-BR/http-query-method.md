---
title: "O novo método HTTP query:Superando as limitações de get e post em APIs modernas"
excerpt: "Conheça o RFC 10008, que define o método HTTP QUERY. Entenda como ele resolve o dilema de enviar buscas complexas com segurança, idempotência e suporte nativo a cache."
category: "Web"
date: "18 de Junho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---
## O dilema histórico das consultas HTTP

Ao projetar APIs REST ou RPC, desenvolvedores frequentemente se deparam com um trade-off frustrante ao implementar buscas complexas:

1. **Usar `GET`:** É o método semanticamente correto para recuperação segura e idempotente de dados. Ele permite cache nativo de forma simples. No entanto, as informações da consulta precisam ser codificadas diretamente na URI (via *query parameters*). Isso introduz limites físicos de tamanho impostos por servidores e intermediários (comumente ~8KB), além de vazar dados sensíveis em logs de servidores, proxies e histórico do navegador.
2. **Usar `POST`:** Permite encapsular payloads de consulta arbitrariamente grandes e complexos (JSON, XML, etc.) diretamente no corpo da requisição, mantendo as informações fora da URI. Contudo, o `POST` não é semanticamente seguro nem idempotente por definição. Isso impossibilita o cacheamento nativo automático e dificulta tentativas de reenvio automático (*retries*) em caso de falha de conexão.

Para resolver este gap histórico na arquitetura da web, o IETF publicou em Junho de 2026 o **RFC 10008**, oficializando o método **`QUERY`**.

---
## O que é o método HTTP query?

O método `QUERY` permite que o cliente envie um corpo de requisição (*request body*) contendo os parâmetros ou a DSL da busca (por exemplo, JSONPath, SQL, ou parâmetros URL-encoded), enquanto mantém as garantias de ser **seguro** e **idempotente**.

### Comparação prática de métodos

| Característica | GET | QUERY | POST |
| :--- | :--- | :--- | :--- |
| **Seguro** (Não altera estado) | Sim | **Sim** | Potencialmente não |
| **Idempotente** (Repetível) | Sim | **Sim** | Potencialmente não |
| **Aceita Corpo (Payload)** | Sem semântica definida | **Sim** | Sim |
| **Cacheável** | Sim | **Sim** (Baseado no corpo) | Apenas sob condições restritas |
| **Risco de Vazamento em Logs** | Alto (Dados na URI) | **Baixo** (Dados no corpo) | Baixo |

---
## Estrutura de uma requisição query

Considere uma busca por contatos onde precisamos filtrar por múltiplos campos estruturados. Em vez de entupir a URI com parâmetros ou usar um `POST` não cacheável, fazemos:

```http
QUERY /contacts HTTP/1.1
Host: api.exemplo.org
Content-Type: application/jsonpath
Accept: application/json

$.contacts[?(@.surname == 'Smith' && @.age > 30)]
```

A resposta correspondente pode retornar os dados diretamente com o status `200 OK`:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Location: /contacts/stored-results/8971

[
  { "surname": "Smith", "givenname": "John", "email": "smith@exemplo.org" }
]
```

### Otimizando cacheamento com `content-location` e `location`

O RFC 10008 introduz maneiras inteligentes de otimizar a experiência do cliente e do cache intermediário usando cabeçalhos de resposta:

- **`Content-Location`:** Aponta para a URI temporária onde o resultado específico desta execução de busca pode ser recuperado via `GET`.
- **`Location`:** Aponta para a URI do recurso equivalente à consulta. O cliente pode usar essa URI para repetir exatamente a mesma busca executando um `GET` subsequente sem precisar trafegar o corpo de requisição original novamente.

---
## Descoberta de suporte com `accept-query`

Os servidores expõem quais linguagens de busca ou formatos de mídia eles aceitam para o método `QUERY` através do cabeçalho de resposta `Accept-Query`.

Uma chamada inicial com o método `OPTIONS` ou `HEAD` revela o suporte do endpoint:

```http
HEAD /contacts HTTP/1.1
Host: api.exemplo.org
```

Resposta:
```http
HTTP/1.1 200 OK
Allow: GET, QUERY, OPTIONS, HEAD
Accept-Query: application/jsonpath, application/sql
```

Se o cliente tentar submeter um formato não suportado, o servidor responderá com `415 Unsupported Media Type` informando no cabeçalho `Accept` (ou `Accept-Query`) as mídias aceitas.

---
## Considerações sobre segurança e cors

O método `QUERY` exige atenção extra em dois tópicos:

1. **Caches:** Os proxies e caches HTTP intermediários agora precisam ler e processar o corpo da requisição (gerando hash do payload) para compor a chave do cache (*cache key*), diferentemente do `GET` que se apoiava apenas na URI e cabeçalhos.
2. **CORS (Cross-Origin Resource Sharing):** Por não estar na lista de métodos simplificados (*CORS-safelisted methods*), qualquer requisição cross-origin usando `QUERY` disparada por navegadores disparará obrigatoriamente uma requisição de pré-fluxo (**CORS Preflight** com o método `OPTIONS`).

O método `QUERY` preenche uma lacuna fundamental no protocolo HTTP, trazendo elegância, eficiência e segurança para APIs que lidam com grandes volumes de dados de filtragem e relatórios complexos.

### Termos técnicos desmistificados
- **Idempotência:** Propriedade em que múltiplas requisições idênticas produzem o mesmo efeito colateral no servidor que uma única requisição.
- **Preflight (CORS):** Requisição automática feita pelo navegador usando `OPTIONS` para verificar se o servidor de destino aceita o método ou cabeçalho customizado solicitado.
- **Cache Key:** Identificador exclusivo usado por um servidor de cache para localizar e entregar uma resposta armazenada anteriormente.
