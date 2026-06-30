---
title: "The new HTTP query method:Overcoming get and post limitations in modern APIs"
excerpt: "Discover RFC 10008, defining the HTTP QUERY method. Learn how it solves the dilemma of sending complex queries safely, idempotently, and with native caching support."
category: "Web"
date: "June 18, 2026"
readTime: "5 min read"
author: "Wesley Lima"
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---
## The historical dilemma of HTTP queries

When designing REST or RPC APIs, developers often face a frustrating trade-off when implementing complex resource queries:

1. **Using `GET`:** Semantically correct for safe and idempotent data retrieval, allowing straightforward native caching. However, query options must be encoded directly in the URI (via query parameters). This introduces physical size limits imposed by servers and intermediaries (commonly ~8KB), and exposes sensitive data in logs of servers, proxies, and browser history.
2. **Using `POST`:** Allows encapsulating arbitrarily large and complex query payloads (JSON, XML, etc.) directly in the request body, keeping them out of the URI. However, `POST` is neither semantically safe nor idempotent by default. This makes native caching impossible and complicates automated retries upon connection drops.

To fill this historical gap in Web architecture, the IETF published **RFC 10008** in June 2026, officializing the **`QUERY`** method.

---
## What is the HTTP query method?

The `QUERY` method allows a client to submit a request body containing query parameters or search DSLs (e.g., JSONPath, SQL, or URL-encoded parameters) while keeping **safe** and **idempotent** semantics.

### Side-by-side comparison

| Property | GET | QUERY | POST |
| :--- | :--- | :--- | :--- |
| **Safe** (Does not change state) | Yes | **Yes** | Potentially no |
| **Idempotent** (Repeatable) | Yes | **Yes** | Potentially no |
| **Accepts Request Body** | No defined semantics | **Yes** | Yes |
| **Cacheable** | Yes | **Yes** (Body-aware) | Only under strict conditions |
| **Log Leakage Risk** | High (Data in URI) | **Low** (Data in body) | Low |

---
## Structure of a query request

Consider a contacts search where we need to filter by multiple structured fields. Instead of packing the URI or using an uncacheable `POST`, we make a `QUERY` call:

```http
QUERY /contacts HTTP/1.1
Host: api.example.org
Content-Type: application/jsonpath
Accept: application/json

$.contacts[?(@.surname == 'Smith' && @.age > 30)]
```

The server processes the request and can return a standard `200 OK` response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Location: /contacts/stored-results/8971

[
  { "surname": "Smith", "givenname": "John", "email": "smith@example.org" }
]
```

### Optimizing cache and subsequent requests with headers

RFC 10008 introduces smart response headers to optimize both client performance and intermediary caching:

- **`Content-Location`:** Identifies a resource holding the specific result of the query operation that was just performed, enabling subsequent `GET` requests to fetch it.
- **`Location`:** Identifies an equivalent resource representing the query parameters themselves. The client can send a `GET` request to this URI to repeat the query operation without resending the query payload.

---
## Support discovery with `accept-query`

Servers advertise which query formats or media types they support for `QUERY` via the `Accept-Query` response header.

An initial discovery check using `OPTIONS` or `HEAD` exposes target support:

```http
HEAD /contacts HTTP/1.1
Host: api.example.org
```

Response:
```http
HTTP/1.1 200 OK
Allow: GET, QUERY, OPTIONS, HEAD
Accept-Query: application/jsonpath, application/sql
```

If a client submits an unsupported format, the server returns `415 Unsupported Media Type` and points to supported media types using the `Accept` (or `Accept-Query`) header.

---
## Security, caching, and cors considerations

Adopting the `QUERY` method requires extra care in two areas:

1. **Caching:** Intermediary HTTP proxies and caches must now parse and process the request payload to calculate a hash for the cache key, unlike `GET` which only relies on the URI and headers.
2. **CORS (Cross-Origin Resource Sharing):** Because `QUERY` is not on the CORS-safelisted methods list, cross-origin browser requests will trigger a preflight check (**CORS Preflight** via `OPTIONS` method).

The `QUERY` method brings clean, efficient, and secure querying semantics to HTTP, closing a long-standing protocol design loop for modern data APIs.

### Technical terms demystified
- **Idempotency:** A property of operations where making multiple identical requests has the same side effect on the server as making a single request.
- **Preflight (CORS):** An automated browser check using `OPTIONS` to verify if the server accepts the requested method or custom headers from a cross-origin caller.
- **Cache Key:** A unique identifier used by a cache system to locate and serve a previously stored response.
