---
title: "Segurança de dados:Rotação de chaves por tópico e HTTP schema registry"
excerpt: "Gerencie contratos de eventos distribuídos e isole o acesso a chaves criptográficas de forma granular. Entenda a rotação de segredos e validação JSON Schema."
category: "Segurança"
date: "24 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 6
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## Segurança e governança de contratos em microsserviços

Em sistemas distribuídos robustos, a governança de dados envolve dois fatores primordiais:
1. **Governança de Contratos:** Como garantir que a estrutura de um payload de evento gerado pelo Time A seja perfeitamente compreendida e consumida pelo Time B, de forma automatizada e centralizada?
2. **Segurança de Dados Granular:** Como garantir que dados altamente confidenciais (PII, dados de pagamento) sejam criptografados com chaves específicas, enquanto mensagens gerais utilizam chaves comuns? E como rotacionar essas chaves sem causar quebras nos consumidores que precisam ler dados históricos nas filas?

A gem **SharedBroker** estende suas fronteiras de validação e segurança com suporte a um **HTTP Schema Registry** remoto (usando JSON Schema padrão) e uma **Estratégia de Rotação de Chaves com Granularidade por Tópico**.

---
## 1. HTTP schema registry:Validação centralizada e distribuída

Embora a validação local via `dry-schema` seja ideal para verificação rápida em desenvolvimento, sistemas complexos corporativos exigem um registro centralizado de contratos de eventos (Schema Registry).

O `SharedBroker` suporta um provedor HTTP para JSON Schema. Na inicialização ou sob demanda, a gem busca os schemas a partir de uma API centralizada de registros e os valida contra os payloads de entrada e saída. Para evitar lentidão na rede nas validações em tempo de execução, a gem implementa cache em memória com tempo de expiração (TTL).

### Configurando o provedor HTTP

```ruby
# Config/initializers/shared_broker.rb

SharedBroker::SchemaRegistry.provider = SharedBroker::SchemaRegistry::Providers::Http.new(
  url: "https://schema-registry.empresa.internal",
  headers: { "Authorization" => "Bearer token-secreto-de-governança" },
  cache_ttl: 300 # Guarda os schemas em cache na memória por 5 minutos
)
```

Sempre que a aplicação publicar ou consumir um evento (por exemplo, `usuario.criado`), o `SharedBroker` valida o payload buscando a definição JSON correspondente em `https://schema-registry.empresa.internal/schemas/usuario.criado.json`.

---
## 2. granularidade de criptografia e rotação de chaves

A criptografia clássica de filas com uma única chave global é frágil: se o segredo vazar, todos os dados de todas as filas estarão expostos. Além disso, trocar a chave global (Key Rotation) torna-se um pesadelo técnico, pois mensagens antigas criptografadas com a chave anterior que ainda não foram consumidas se perderão.

Para solucionar isso, implementamos um **Key Provider Registry** no `SharedBroker`. Ele resolve a rotação e a granularidade definindo:
* Mapeamento de chaves ativas para tópicos usando padrões curingas (ex: `payment.*` usa chave financeira, outros tópicos usam chave geral).
* Um dicionário de chaves históricas (`keys`) identificadas por um ID (`_key_id`).
* Inclusão do `_key_id` no envelope da mensagem no momento da publicação.

### Lógica do key provider registry

```ruby
module SharedBroker
  module KeyProvider
    class Registry
      def initialize(keys:, active_keys:)
        @keys = keys
        @active_keys = active_keys
      end

      # Identifica qual a chave ativa no momento da publicação de um tópico
      def active_key_for(topic)
        match = @active_keys.keys.find { |pattern| File.fnmatch?(pattern, topic) }
        key_id = @active_keys[match] || "*"
        
        [key_id, @keys[key_id]]
      end

      # Recupera a chave histórica correta para descriptografia baseado no ID do envelope
      def find_key(key_id)
        @keys[key_id] || raise("Chave criptografica nao encontrada no registro: #{key_id}")
      end
    end
  end
end
```

### Configurando o registro de chaves

```ruby
# Inicializa o registro mapeando as chaves ativas por padrões de tópicos
key_registry = SharedBroker::KeyProvider::Registry.new(
  keys: {
    "v1"            => "chave_historica_global_de_32_bytes_a",
    "v2"            => "chave_atual_global_de_32_bytes_b_b",
    "finance_key_1" => "chave_financeira_segura_de_32_bytes"
  },
  active_keys: {
    # Tópicos financeiros usam a chave financeira exclusiva
    "payment.*" => "finance_key_1",
    # Qualquer outro tópico usa a versão mais recente da chave global (v2)
    "*"         => "v2"
  }
)

# Injeta o gerenciador de chaves no cliente da gem
SPOT_BROKER = SharedBroker::Client.new(
  adapter: BROKER_ADAPTER,
  key_provider: key_registry
)
```

Com este fluxo, quando o produtor envia o evento `payment.processed`, o payload é criptografado com a chave `finance_key_1` e a marcação `_key_id: "finance_key_1"` é acoplada. Se na fila houver mensagens antigas com `_key_id: "v1"`, o consumidor buscará dinamicamente a chave correspondente no registro histórico e descriptografará a mensagem sem falhas.

---
## Conclusão

Proteger a borda das nossas mensagens não precisa ser um processo pesado ou complexo de se manter. Utilizando validações centrais via Schema Registry e granularidade com rotação de chaves no `SharedBroker`, elevamos o patamar de segurança e integridade das nossas arquiteturas orientadas a eventos sem acoplar regras de segurança à lógica de negócios.

### Termos técnicos desmistificados
- **JSON Schema:** Um vocabulário declarativo baseado em JSON para validar a estrutura, tipos e regras de dados estruturados.
- **TTL (Time to Live):** Tempo limite durante o qual um dado de cache é considerado válido antes de expirar e ser descartado.
- **Glob Pattern:** Padrões curingas simples de string como `*` (corresponde a qualquer caractere) e `?` para busca e filtros rápidos.
