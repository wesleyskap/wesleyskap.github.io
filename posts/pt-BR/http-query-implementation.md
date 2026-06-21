---
title: "Implementação Prática: Construindo um Servidor HTTP QUERY do Zero em Go e Ruby"
excerpt: "Coloque a teoria do RFC 10008 em prática. Aprenda a implementar o suporte ao método HTTP QUERY do zero no ecossistema Go (net/http) e em Ruby (Rack/Sinatra), tratando roteamento, status 422 e cache condicional."
category: "Web"
date: "21 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "http-query-series"
seriesIndex: 4
referenceLink: "https://www.rfc-editor.org/rfc/rfc10008.html"
---

## Do Papel para o Código: Implementando o RFC 10008

Nos posts anteriores da série, destrinchamos a semântica, o impacto arquitetural e as regras de negociação de conteúdo/cache do método **HTTP QUERY** (RFC 10008). Mas como de fato suportamos esse novo verbo nos servidores de produção que desenvolvemos no dia a dia?

Como a maioria dos frameworks de mercado (como Ruby on Rails, Sinatra, Express ou os roteadores padrão do Go) foram historicamente construídos sob a premissa de verbos fixos (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD), dar suporte ao `QUERY` muitas vezes exige que estendamos o comportamento dessas ferramentas de forma manual e elegante.

Neste guia prático, vamos codificar um servidor completo capaz de lidar com a semântica do método `QUERY` em duas linguagens comumente utilizadas para sistemas distribuídos de alta escala: **Go** e **Ruby**.

---

## 1. Implementação em Go (net/http)

O Go possui uma biblioteca padrão excelente para lidar com requisições HTTP. Vamos construir um servidor que implementa as boas práticas da linguagem, utilizando `http.MaxBytesReader` para evitar ataques de negação de serviço (DoS) por payloads gigantescos, `json.NewDecoder` para parsing eficiente em streaming e centralização da resposta com geração de `ETag`.

### O Servidor em Go

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

// Banco de dados simulado em memória usando nomes genéricos
var database = []Contact{
	{ID: 1, Name: "Nome 1", Status: "active", Tags: []string{"go", "ruby", "telemetria"}},
	{ID: 2, Name: "Nome 2", Status: "inactive", Tags: []string{"product", "agile"}},
	{ID: 3, Name: "Nome 3", Status: "active", Tags: []string{"go", "concorrencia"}},
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
		http.Error(w, `{"error": "Método não permitido"}`, http.StatusMethodNotAllowed)
		return
	}

	if r.Method == http.MethodGet {
		respondJSON(w, database, "")
		return
	}

	// Processamento do método QUERY
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		http.Error(w, `{"error": "Media type não suportado"}`, http.StatusUnsupportedMediaType)
		return
	}

	// Limitar tamanho do corpo (ex: 1MB) para evitar consumo excessivo de memória
	r.Body = http.MaxBytesReader(w, r.Body, 1048576)

	var query struct {
		Status string   `json:"status"`
		Tags   []string `json:"tags"`
	}

	if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
		http.Error(w, `{"error": "JSON malformado"}`, http.StatusBadRequest)
		return
	}

	if query.Status != "" && query.Status != "active" && query.Status != "inactive" {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusUnprocessableEntity) // 422
		w.Write([]byte(`{"title": "Valor de busca inválido", "status": 422}`))
		return
	}

	results := filterContacts(query.Status, query.Tags)
	respondJSON(w, results, r.Header.Get("If-None-Match"))
}

func filterContacts(status string, tags []string) []Contact {
	var filtered []Contact
	for _, c := range database {
		if (status == "" || c.Status == status) && hasTags(c.Tags, tags) {
			filtered = append(filtered, c)
		}
	}
	return filtered
}

func hasTags(contactTags, queryTags []string) bool {
	for _, qTag := range queryTags {
		found := false
		for _, cTag := range contactTags {
			if cTag == qTag {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
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

## 2. Implementação em Ruby (Ruby on Rails)

No ecossistema Ruby, embora middlewares Rack genéricos funcionem perfeitamente, o mais comum no dia a dia corporativo é a utilização do **Ruby on Rails**. 

Para expor o suporte ao verbo `QUERY` de forma limpa e idiomática no Rails, configuramos o roteamento dinâmico e utilizamos recursos integrados do framework, como o método `stale?` para gerenciar ETags de forma nativa.

### O Controller no Rails

```ruby
# config/routes.rb
Rails.application.routes.draw do
  # Mapeia GET e QUERY para a mesma action no controller
  match '/contacts', to: 'contacts#index', via: [:get, :query]
end

# app/controllers/contacts_controller.rb
class ContactsController < ApplicationController
  before_action :set_rfc_headers
  before_action :validate_query_request, only: [:index], if: -> { request.method == 'QUERY' }

  DATABASE = [
    { id: 1, name: "Nome 1", status: "active", tags: ["go", "ruby", "telemetria"] },
    { id: 2, name: "Nome 2", status: "inactive", tags: ["product", "agile"] },
    { id: 3, name: "Nome 3", status: "active", tags: ["go", "concorrencia"] }
  ].freeze

  def index
    if request.method == 'GET'
      return render json: DATABASE
    end

    process_query
  end

  private

  def set_rfc_headers
    response.set_header('Allow', 'GET, QUERY, OPTIONS, HEAD')
    response.set_header('Accept-Query', 'application/json')
  end

  def validate_query_request
    return if request.media_type == 'application/json'

    render json: { error: "Unsupported media type. Use application/json" },
           status: :unsupported_media_type
  end

  def process_query
    query_params = params.permit(:status, tags: [])
    status_filter = query_params[:status]
    tags_filter = query_params[:tags] || []

    if status_filter.present? && !['active', 'inactive'].include?(status_filter)
      return render_invalid_query
    end

    results = filter_contacts(status_filter, tags_filter)
    render_cached(results)
  end

  def filter_contacts(status_filter, tags_filter)
    DATABASE.select do |contact|
      matches_status = status_filter.blank? || contact[:status] == status_filter
      matches_tags = tags_filter.empty? || (tags_filter - contact[:tags]).empty?
      matches_status && matches_tags
    end
  end

  def render_invalid_query
    render json: { title: "Valor de busca inválido", status: 422 },
           status: :unprocessable_entity,
           content_type: 'application/problem+json'
  end

  def render_cached(results)
    return unless stale?(json: results, public: false, cache_control: 'max-age=3600')

    render json: results
  end
end
```

---

## 3. Principais Desafios de Produção ao Adotar HTTP QUERY

Ao colocar essas implementações em produção, considere os seguintes pontos de infraestrutura:

| Desafio | Causa Raiz | Mitigação Recomendada |
| :--- | :--- | :--- |
| **Bloqueio de Proxies/WAFs** | Proxies reversos antigos ou Firewalls de Aplicação Web (WAF) podem classificar o verbo `QUERY` como requisição inválida ou ataque. | Configurar regras explícitas de bypass para o verbo `QUERY` no NGINX, Cloudflare ou AWS CloudFront. |
| **Payload Ingestion Attacks** | O envio de corpos gigantescos de queries complexas pode exaurir a CPU ou memória do parser JSON. | Limitar o tamanho do corpo da requisição (`r.Body` em Go ou `Content-Length` em Ruby) para no máximo 10KB a 50KB em rotas de busca. |
| **Limpeza de Cache Falso-Positivo** | Se o banco mudar no mesmo milissegundo em que a ETag é gerada, clientes podem receber dados desatualizados. | Utilize mecanismos robustos de invalidação ou gere ETags contendo timestamps de última atualização da tabela (*last modified*). |

---

## Conclusão

Implementar o método HTTP `QUERY` em Go e Ruby prova que o protocolo da Web é altamente adaptável e flexível. Com poucas linhas de código, podemos contornar as limitações tradicionais dos verbos clássicos, criando endpoints que são, ao mesmo tempo, seguros quanto à exposição de dados, robustos e compatíveis com a infraestrutura global de cache.

Adotar o `QUERY` hoje prepara seus serviços para um ecossistema mais enxuto, eficiente e alinhado com as melhores práticas de engenharia de software modernas.
