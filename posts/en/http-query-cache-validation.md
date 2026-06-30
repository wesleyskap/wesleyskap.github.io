---
title: "Content negotiation, conditional requests, and semantic error handling in HTTP query"
excerpt: "Deep dive into RFC 10008. Learn how to design resilient servers by handling query syntax errors with status 415/422, managing advanced body-based caching with ETags, and serving conditional responses."
category: "Web"
date: "June 20, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "http-query-series"
seriesIndex: 3
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---
## Going beyond the basics in rfc 10008

In the previous posts of this series, we covered what the HTTP `QUERY` method is and how it resolves the classic trade-offs of complex resource querying in REST and GraphQL.

However, to implement `QUERY` in production-ready servers, we need to understand the deeper rules defined in **RFC 10008**: how to negotiate query formats, how to expose semantic query errors with precise HTTP status codes, and how to optimize infrastructure using conditional requests with `ETag`.

---
## 1. content negotiation:Validating search formats

The body of a `QUERY` request is not just plain text; it must follow a specific media type that the server understands.

### Discovering query formats with `accept-query`
According to the RFC, the server advertises its accepted query formats via the `Accept-Query` response header. Clients can discover these formats by making an initial `OPTIONS` or `HEAD` request:

```http
OPTIONS /contacts HTTP/1.1
Host: api.example.org
```

Server Response:
```http
HTTP/1.1 200 OK
Allow: GET, QUERY, OPTIONS, HEAD
Accept-Query: application/jsonpath, application/sql;charset="UTF-8"
```

### Error handling with status 415 and 406
If the client submits an unsupported query format or requests an incompatible response, the server must decline the request semantically:

1. **`415 Unsupported Media Type`**: Sent when the query payload's media type is not supported by the endpoint. The server must include the `Accept-Query` header in the error response showing supported options.
2. **`406 Not Acceptable`**: Sent if the client's `Accept` header requests a response format (like `text/csv`) that the search endpoint cannot produce for the resulting dataset.

---
## 2. semantic error handling:The power of status 422

One of the biggest challenges in handling dynamic queries (like JSONPath or SQL sent in the request body) is separating **transport/syntax errors** from **logical execution errors**.

RFC 10008 resolves this by dividing errors into distinct, precise HTTP status codes:

* **`400 Bad Request`**: Used when the query body is corrupted or violates the basic syntax of the specified media type (e.g., malformed JSON).
* **`422 Unprocessable Content`**: Used when the query is syntactically correct and format-compliant, but **cannot be executed due to semantic domain errors** (e.g., a well-formed SQL query that attempts to select columns from a non-existent database table).

### Example of a 422 response:

Client Request:
```http
QUERY /contacts HTTP/1.1
Host: api.example.org
Content-Type: application/jsonpath

$.contacts[?(@.nonExistentField == 'Smith')]
```

Server Response:
```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.example.org/errors/invalid-query-filter",
  "title": "Invalid query filter",
  "status": 422,
  "detail": "The field 'nonExistentField' does not exist in the contacts schema."
}
```

---
## 3. conditional requests:Avoiding redundant traffic

Unlike `POST`, the `QUERY` method is safe and idempotent, meaning it has full native support for **Conditional Requests** (Section 2.6 of RFC 10008).

When a server executes a complex search, it can compute a hash of the query results and return it inside the `ETag` (Entity Tag) response header:

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "result-hash-123"
Cache-Control: private, max-age=3600

[
  { "id": 1, "name": "John" }
]
```

### Optimizing with `if-none-match`
The next time the client needs to run the exact same search query, it submits the same query body and includes the `If-None-Match` header containing the previously received `ETag`:

```http
QUERY /contacts HTTP/1.1
Host: api.example.org
Content-Type: application/jsonpath
If-None-Match: "result-hash-123"

$.contacts[?(@.status == 'active')]
```

If the database records have not changed since the last execution, the server skips data serialization and replies with a lightweight **`304 Not Modified`** response containing only headers:

```http
HTTP/1.1 304 Not Modified
ETag: "result-hash-123"
Date: Sat, 20 Jun 2026, 10:00:00 GMT
```

This saves critical network bandwidth and drops client response latency to near zero.

### Advanced optimization:Assigning an equivalent resource (dedicated URI)

According to Section 2.5 of RFC 10008, when a `QUERY` request is successful, the server has the option to assign a temporary or permanent URI to the result of that equivalent query. The server does this by returning the `Location` header in the `200 OK` response.

This allows the client, in subsequent calls, to make a simple `GET` directly to the associated URI passing conditional validation headers. This prevents the client from having to resend the heavy query body (`QUERY`) every time it wants to check if the data has changed.

The diagrams below illustrate the use of conditional requests and how they can differ when a URI is assigned to the equivalent resource (and when the client is taking advantage of it). The fictitious field name "Validator" is used for demonstration purposes (equivalent to `ETag` or `Last-Modified` in the real protocol):

#### Scenario a:Data flow with query only (no equivalent URI)

In this flow, the client performs all subsequent validations by sending the full `QUERY` method with the original body in the request:

```
Client                                      Server
   │                                            │
   │--- [1] QUERY (with search payload) ------->│
   │<-- [2] 200 OK (Validator: foo) ------------│
   │                                            │
   │--- [3] QUERY (with payload + If-None) ---->│  <-- Conditional on 'foo'
   │<-- [4] 304 Not Modified -------------------│
   │                                            │
   │               [State Changed]              │
   │                                            │
   │--- [5] QUERY (com payload + If-None) ----> │  <-- Conditional on 'foo'
   │<-- [6] 200 OK (Validator: bar + Data) -----│
   │                                            │
```

#### Scenario b:Data flow with get to equivalent resource (dedicated URI)

In this flow, the server creates a temporary endpoint representative of the query result (e.g., `/xyz`). The client can then perform lightweight conditional checks using `GET` directly on that URI, without resending the query payload:

```
Client                                      Server
   │                                            │
   │--- [1] QUERY (with search payload) ------->│
   │                                            │--- (Generates Resource /xyz)
   │<-- [2] 200 OK (Validator: foo) ------------│
   │        (Location: /xyz)                    │
   │                                            │
   │--- [3] GET /xyz (If-None-Match: foo) ----->│  <-- Conditional on 'foo'
   │<-- [4] 304 Not Modified -------------------│
   │                                            │
   │               [State Changed]              │
   │                                            │
   │--- [5] GET /xyz (If-None-Match: foo) ----->│  <-- Conditional on 'foo'
   │<-- [6] 200 OK (Validator: bar + Data) -----│
   │                                            │
```

---
## Query vs byte range requests (pagination)

RFC 10008 dedicates a section (Section 2.8) to the behavior of **Range Requests** (such as `Range: bytes=0-499`).

The specification concludes that using byte ranges at the protocol level has very little practical value for the `QUERY` method. Since database searches return dynamic and fluid data, pagination must be handled **internally within the query format** (e.g., using structures like `OFFSET/LIMIT` or cursor-based pagination fields in the query payload) instead of slicing HTTP raw traffic into bytes.

---
## Conclusion

Mastering content negotiation, semantic error handling with status `422`, and conditional caching using `If-None-Match` elevates your API design to enterprise-level resilience and performance.

With these mechanisms in place, the HTTP `QUERY` method establishes itself as the ultimate tool for modern, query-heavy distributed applications.

### Technical terms demystified
- **Content Negotiation:** A mechanism that allows clients and servers to agree on the media type, language, or encoding of a resource during communication.
- **ETag (Entity Tag):** A unique validator string token representing a specific version of a resource's state.
- **304 Not Modified:** An HTTP status code indicating that the resource has not changed since the last request, telling the client to load the local cached copy.
