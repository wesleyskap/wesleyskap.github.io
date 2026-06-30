---
title: "Negociação de conteúdo, requisições condicionais e tratamento de erros semânticos no HTTP query"
excerpt: "Aprofunde-se no RFC 10008 e aprenda como projetar servidores resilientes tratando erros de formato com status 415/422, controlando cache avançado com ETag e respondendo de forma condicional."
category: "Web"
date: "20 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "http-query-series"
seriesIndex: 3
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---
## Indo além do básico no rfc 10008

Nos posts anteriores da série, cobrimos o que é o método HTTP `QUERY` e como ele resolve os trade-offs clássicos de consultas complexas em REST e GraphQL. 

Porém, para implementar o `QUERY` em servidores reais de produção, precisamos entender as regras mais profundas descritas no **RFC 10008**: como negociar formatos de busca, como expor erros semânticos usando códigos HTTP precisos e como otimizar a infraestrutura utilizando requisições condicionais com `ETag`.

---
## 1. negociação de conteúdo:Validando formatos de busca

O corpo de uma requisição `QUERY` não é apenas um texto livre; ele deve respeitar um formato de mídia (*media type*) específico e compreendido pelo servidor.

### Descoberta de formatos com `accept-query`
Conforme o RFC, o servidor anuncia os formatos de busca que aceita através do cabeçalho de resposta `Accept-Query`. O cliente pode descobrir esses formatos fazendo uma chamada inicial `OPTIONS` ou `HEAD`:

```http
OPTIONS /contacts HTTP/1.1
Host: api.exemplo.org
```

Resposta do Servidor:
```http
HTTP/1.1 200 OK
Allow: GET, QUERY, OPTIONS, HEAD
Accept-Query: application/jsonpath, application/sql;charset="UTF-8"
```

### O fluxo de erro com status 415 e 406
Se o cliente enviar um formato inválido ou solicitar um retorno incompatível, o servidor deve recusar a requisição de forma semântica:

1. **`415 Unsupported Media Type`**: Ocorre quando o formato do payload de busca não é suportado pelo endpoint. O servidor deve incluir o cabeçalho `Accept-Query` na resposta de erro informando as opções válidas.
2. **`406 Not Acceptable`**: Ocorre se o cabeçalho `Accept` da requisição solicitar um formato de resposta (como `text/csv`) que o endpoint de busca não sabe gerar para aqueles dados.

---
## 2. tratamento de erros semânticos:O poder do status 422

Um dos maiores desafios no tratamento de consultas dinâmicas (como SQL ou JSONPath enviados no corpo) é separar **erros de transporte/sintaxe** de **erros de execução lógica**.

O RFC 10008 resolve isso dividindo os erros em códigos HTTP claros:

* **`400 Bad Request`**: Deve ser usado quando o corpo da consulta está corrompido ou viola a sintaxe básica do formato especificado no `Content-Type` (ex: um JSON malformado).
* **`422 Unprocessable Content`**: Deve ser usado quando a consulta é sintaticamente perfeita e o formato é aceito, mas ela **não pode ser executada por razões semânticas do domínio** (ex: uma query SQL bem-formada que tenta buscar dados em uma tabela que não existe no banco de dados).

### Exemplo de resposta com status 422:

Requisição do Cliente:
```http
QUERY /contacts HTTP/1.1
Host: api.exemplo.org
Content-Type: application/jsonpath

$.contacts[?(@.nonExistentField == 'Smith')]
```

Resposta do Servidor:
```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.exemplo.org/errors/invalid-query-filter",
  "title": "Filtro de busca inválido",
  "status": 422,
  "detail": "O campo 'nonExistentField' não existe no esquema de contatos."
}
```

---
## 3. requisições condicionais:Evitando tráfego redundante

Diferente do método `POST`, o método `QUERY` é seguro e idempotente, o que significa que ele possui suporte nativo completo para **Requisições Condicionais** (Seção 2.6 do RFC 10008).

Quando o servidor executa uma busca complexa, ele pode calcular um hash do resultado e retorná-lo sob o cabeçalho `ETag` (Entity Tag):

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "hash-resultado-123"
Cache-Control: private, max-age=3600

[
  { "id": 1, "name": "John" }
]
```

### Otimizando com `if-none-match`
Na próxima vez que o cliente precisar fazer a mesma consulta de busca complexa, ele envia exatamente o mesmo payload no corpo e inclui o cabeçalho `If-None-Match` contendo o `ETag` obtido anteriormente:

```http
QUERY /contacts HTTP/1.1
Host: api.exemplo.org
Content-Type: application/jsonpath
If-None-Match: "hash-resultado-123"

$.contacts[?(@.status == 'active')]
```

Se os dados no banco de dados não sofreram alterações desde a última busca, o servidor responde com um levíssimo **`304 Not Modified`** contendo apenas cabeçalhos, sem trafegar o corpo de resposta JSON:

```http
HTTP/1.1 304 Not Modified
ETag: "hash-resultado-123"
Date: Sat, 20 Jun 2026, 10:00:00 GMT
```

Isso economiza recursos valiosos de rede e reduz o tempo de resposta percebido pelo usuário final a quase zero.

### Otimização avançada:Associando um recurso equivalente (URI dedicada)

Conforme a Seção 2.5 do RFC 10008, quando uma requisição `QUERY` é bem-sucedida, o servidor tem a opção de associar um URI temporário ou permanente ao resultado daquela consulta equivalente. O servidor faz isso retornando o cabeçalho `Location` na resposta `200 OK`. 

Isso permite que o cliente, nas próximas chamadas, faça um simples `GET` diretamente no URI associado passando cabeçalhos de validação condicional. Isso evita que o cliente precise reenviar o corpo pesado da consulta (`QUERY`) toda vez que quiser verificar se os dados foram alterados.

Os diagramas abaixo ilustram o uso de requisições condicionais e como elas diferem quando um URI é associado ao recurso equivalente (e quando o cliente se beneficia disso). O nome de campo fictício "Validator" é utilizado apenas para fins de demonstração (equivalente ao `ETag` ou `Last-Modified` no protocolo real):

#### Cenário a:Fluxo de dados apenas com query (sem URI equivalente)

Neste fluxo, o cliente realiza todas as validações subsequentes enviando o método `QUERY` completo com o corpo original na requisição:

```
Cliente                                     Servidor
   │                                             │
   │--- [1] QUERY (com payload de busca)  ------>│
   │<-- [2] 200 OK (Validator: foo)  ------------│
   │                                             │
   │--- [3] QUERY (com payload + If-None) ------>│  <-- Condicional a 'foo'
   │<-- [4] 304 Not Modified  -------------------│
   │                                             │
   │             [Estado Alterado]               │
   │                                             │
   │--- [5] QUERY (com payload + If-None) ------>│  <-- Condicional a 'foo'
   │<-- [6] 200 OK (Validator: bar + Dados) -----│
   │                                             │
```

#### Cenário b:Fluxo de dados com get para recurso equivalente (URI dedicada)

Neste fluxo, o servidor cria um endpoint temporário representativo do resultado da busca (ex: `/xyz`). O cliente pode então efetuar consultas condicionais super leves usando `GET` diretamente nessa URI, sem reenviar o payload da query:

```
Cliente                                     Servidor
   │                                            │
   │--- [1] QUERY (com payload de busca) ------>│
   │                                            │--- (Gera Recurso /xyz)
   │<-- [2] 200 OK (Validator: foo) ------------│
   │        (Location: /xyz)                    │
   │                                            │
   │--- [3] GET /xyz (If-None-Match: foo) ----->│  <-- Condicional a 'foo'
   │<-- [4] 304 Not Modified -------------------│
   │                                            │
   │             [Estado Alterado]              │
   │                                            │
   │--- [5] GET /xyz (If-None-Match: foo) ----->│  <-- Condicional a 'foo'
   │<-- [6] 200 OK (Validator: bar + Dados) ----│
   │                                            │
```

---
## Query vs paginação de bytes (range requests)

O RFC 10008 dedica uma seção (Seção 2.8) ao uso de **Range Requests** (como cabeçalhos `Range: bytes=0-499`). 

A especificação define que o uso de paginação por bytes no nível do protocolo traz pouca utilidade prática para o método `QUERY`. Como as consultas frequentemente retornam dados dinâmicos e fluidos do banco, a paginação deve ser tratada **internamente no formato da consulta** (ex: usando comandos como `OFFSET/LIMIT` ou estruturas de paginação baseadas em cursores no payload da query) ao invés de fatiar o tráfego HTTP em bytes brutos.

---
## Conclusão

Dominar a negociação de conteúdo, a semântica de erros com o status `422` e o poder do cache condicional com `If-None-Match` eleva a arquitetura de suas APIs a um patamar profissional de resiliência e alta performance.

Com estes mecanismos, o HTTP `QUERY` prova ser a ferramenta definitiva para o desenvolvimento de sistemas distribuídos modernos baseados em leitura intensa e complexa de dados.

### Termos técnicos desmistificados
- **Content Negotiation (Negociação de Conteúdo):** Mecanismo que permite que o cliente e o servidor cheguem a um acordo sobre o formato do arquivo (mídia, idioma, codificação) usado na requisição ou na resposta.
- **ETag (Entity Tag):** Um validador de cache na forma de token de string exclusivo que representa o estado de uma versão específica de um recurso.
- **304 Not Modified:** Código de status HTTP que informa ao cliente que o recurso não foi alterado desde a última requisição, instruindo o navegador ou proxy a usar a cópia em cache local.
