---
title: "Practical Implementation: Building an HTTP QUERY Server from Scratch in Go and Ruby"
excerpt: "Put RFC 10008 into practice. Learn how to implement HTTP QUERY support from scratch in Go (net/http) and Ruby (Rack/Sinatra), handling routing, status 422, and conditional caching."
category: "Web"
date: "June 21, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "http-query-series"
seriesIndex: 4
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---

## From Spec to Code: Implementing RFC 10008

In the previous posts of this series, we broke down the semantics, architectural impact, and content negotiation/caching rules of the **HTTP QUERY** method (RFC 10008). But how do we actually support this new verb in the production servers we build day-to-day?

Since most market frameworks (such as Ruby on Rails, Sinatra, Express, or Go's default routers) were historically built under the assumption of fixed verbs (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD), supporting `QUERY` often requires extending the behavior of these tools manually and elegantly.

In this practical guide, we will code a complete server capable of handling the semantics of the `QUERY` method in two languages commonly used for high-scale distributed systems: **Go** and **Ruby**.

---

## 1. Implementation in Go (net/http)

Go features an excellent standard library for handling HTTP requests. Let's build a server that implements Go best practices, utilizing `http.MaxBytesReader` to prevent denial-of-service (DoS) attacks from giant payloads, `json.NewDecoder` for efficient streaming parsing, and centralized responses with ETag generation.

### The Go Server

```go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Contact struct {
	ID     int      `json:"id"`
	Name   string   `json:"name"`
	Status string   `json:"status"`
	Tags   []string `json:"tags"`
}

// Simulated in-memory database using generic names
var database = []Contact{
	{ID: 1, Name: "Name 1", Status: "active", Tags: []string{"go", "ruby", "telemetry"}},
	{ID: 2, Name: "Name 2", Status: "inactive", Tags: []string{"product", "agile"}},
	{ID: 3, Name: "Name 3", Status: "active", Tags: []string{"go", "concurrency"}},
}

func main() {
	http.HandleFunc("/contacts", contactsHandler)
	http.ListenAndServe(":8080", nil)
}

func contactsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Allow", "GET, QUERY, OPTIONS, HEAD")
	w.Header().Set("Accept-Query", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "QUERY" && r.Method != http.MethodGet {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	if r.Method == http.MethodGet {
		respondJSON(w, database, "")
		return
	}

	// Processing the QUERY method
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		http.Error(w, `{"error": "Unsupported media type"}`, http.StatusUnsupportedMediaType)
		return
	}

	// Limit body size (e.g. 1MB) to prevent excessive memory consumption
	r.Body = http.MaxBytesReader(w, r.Body, 1048576)

	var query struct {
		Status string   `json:"status"`
		Tags   []string `json:"tags"`
	}

	if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
		http.Error(w, `{"error": "Malformed JSON"}`, http.StatusBadRequest)
		return
	}

	if query.Status != "" && query.Status != "active" && query.Status != "inactive" {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusUnprocessableEntity) // 422
		w.Write([]byte(`{"title": "Invalid query value", "status": 422}`))
		return
	}

	results := filterContacts(query.Status, query.Tags)
	respondJSON(w, results, r.Header.Get("If-None-Match"))
}

func filterContacts(status string, tags []string) []Contact {
	var filtered []Contact
	for _, c := range database {
		if status != "" && c.Status != status {
			continue
		}
		if len(tags) > 0 {
			hasAll := true
			for _, tag := range tags {
				hasTag := false
				for _, t := range c.Tags {
					if t == tag {
						hasTag = true
						break
					}
				}
				if !hasTag {
					hasAll = false
					break
				}
			}
			if !hasAll {
				continue
			}
		}
		filtered = append(filtered, c)
	}
	return filtered
}

func respondJSON(w http.ResponseWriter, data interface{}, ifNoneMatch string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, max-age=3600")

	body, _ := json.Marshal(data)
	hash := sha256.Sum256(body)
	etag := fmt.Sprintf(`W/"%s"`, hex.EncodeToString(hash[:8]))
	w.Header().Set("ETag", etag)

	if ifNoneMatch == etag {
		w.WriteHeader(http.StatusNotModified) // 304
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(body)
}
```

---

## 2. Implementation in Ruby (Ruby on Rails)

In the Ruby ecosystem, while generic Rack middlewares work perfectly, the most common setup in day-to-day enterprise work is **Ruby on Rails**.

To expose support for the `QUERY` verb cleanly and idiomatically in Rails, we configure dynamic routing and use built-in framework features, such as the `stale?` method to natively handle ETags.

### The Rails Controller

```ruby
# config/routes.rb
Rails.application.routes.draw do
  # Maps GET and QUERY to the same controller action
  match '/contacts', to: 'contacts#index', via: [:get, :query]
end

# app/controllers/contacts_controller.rb
class ContactsController < ApplicationController
  before_action :set_rfc_headers
  before_action :validate_query_request, only: [:index], if: -> { request.method == 'QUERY' }

  DATABASE = [
    { id: 1, name: "Name 1", status: "active", tags: ["go", "ruby", "telemetry"] },
    { id: 2, name: "Name 2", status: "inactive", tags: ["product", "agile"] },
    { id: 3, name: "Name 3", status: "active", tags: ["go", "concurrency"] }
  ]

  def index
    if request.method == 'GET'
      render json: DATABASE and return
    end

    # Processing the QUERY method
    query_params = params.permit(:status, tags: [])
    status_filter = query_params[:status]
    tags_filter = query_params[:tags] || []

    if status_filter.present? && !['active', 'inactive'].include?(status_filter)
      return render json: { title: "Invalid query value", status: 422 },
                    status: :unprocessable_entity,
                    content_type: 'application/problem+json'
    end

    results = DATABASE.select do |contact|
      matches_status = status_filter.blank? || contact[:status] == status_filter
      matches_tags = tags_filter.empty? || (tags_filter - contact[:tags]).empty?
      matches_status && matches_tags
    end

    # Native Rails conditional caching (ETag & If-None-Match)
    if stale?(json: results, public: false, cache_control: 'max-age=3600')
      render json: results
    end
  end

  private

  def set_rfc_headers
    response.set_header('Allow', 'GET, QUERY, OPTIONS, HEAD')
    response.set_header('Accept-Query', 'application/json')
  end

  def validate_query_request
    if request.media_type != 'application/json'
      render json: { error: "Unsupported media type. Use application/json" }, status: :unsupported_media_type
    end
  end
end
```

---

## 3. Key Production Challenges When Adopting HTTP QUERY

When putting these implementations into production, consider the following infrastructure points:

| Challenge | Root Cause | Recommended Mitigation |
| :--- | :--- | :--- |
| **Proxy/WAF Blocking** | Legacy reverse proxies or Web Application Firewalls (WAF) may classify the `QUERY` verb as an invalid request or attack. | Configure explicit bypass rules for the `QUERY` verb in NGINX, Cloudflare, or AWS CloudFront. |
| **Payload Ingestion Attacks** | Sending massive, complex query bodies can exhaust memory or CPU during JSON parsing. | Limit request body size (`r.Body` in Go or `Content-Length` in Ruby) to a maximum of 10KB to 50KB on query routes. |
| **False-Positive Cache Clears** | If the database changes in the same millisecond the ETag is computed, clients might receive stale data. | Use robust cache invalidation strategies or generate ETags containing the table's last-update timestamp (*last modified*). |

---

## Conclusion

Implementing the HTTP `QUERY` method in Go and Ruby demonstrates that the Web protocol is highly adaptive and flexible. With just a few lines of code, we can bypass the traditional limitations of classic verbs, building endpoints that are secure, robust, and fully compatible with global caching infrastructure.

Adopting `QUERY` today prepares your services for a leaner, more efficient ecosystem aligned with modern software engineering best practices.
