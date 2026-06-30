---
title: "Fronteiras seguras:Validação de payload (dry-schema e HTTP registry), criptografia aes-256-gcm e rotação de chaves"
excerpt: "Como garantir a integridade dos contratos e a segurança de dados sensíveis na rede? Veja validação de payloads e criptografia com chaves rotativas."
category: "Segurança"
date: "02 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## A necessidade de validação e segurança nas fronteiras de rede

Em arquiteturas orientadas a eventos, os contratos de payloads são vitais. Se um serviço parceiro alterar o tipo de um campo sem aviso (como mudar uma variável de `integer` para `string`), os consumidores subsequentes sofrerão de quebras lógicas inesperadas.

Além disso, mensagens que trafegam por brokers compartilhados (como servidores Redis ou Kafka em nuvens públicas) podem conter informações sensíveis (PII, dados bancários, tokens) expostas a interceptações se não forem criptografadas.

A gem **SharedBroker** aborda esses dois pilares combinando validações estruturadas dinâmicas (locais e remotas) a uma camada de criptografia simétrica com **Rotação de Chaves (Key Rotation)**.

## Validando contratos dinamicamente (dry-schema e JSON schema)

O mecanismo de validação da gem é pluggável. Ele valida a integridade estrutural das mensagens na saída (`publish`) e na entrada (`subscribe`).
Utilizamos o `dry-schema` localmente para garantir rapidez na checagem inicial de tipagem:

```ruby
require 'dry-schema'

module SharedBroker
  module Validation
    def self.validate!(topic, payload)
      schema = Registry.find(topic)
      return true unless schema

      result = schema.call(payload)
      unless result.success?
        raise "Contrato invalido para o topico #{topic}: #{result.errors.to_h}"
      end
    end
  end
end
```

Para ambientes corporativos que padronizam schemas de forma distribuída, a gem suporta buscar e cachear schemas JSON a partir de um servidor HTTP de registros remoto (`SchemaRegistry::Providers::Http`), reduzindo a latência através de cache em memória com expiração controlada (TTL).

## Criptografia transparente aes-256-gcm e rotação de chaves

A gem protege a integridade dos dados aplicando de forma automatizada e invisível a criptografia simétrica usando a cifra segura **AES-256-GCM**.

Para suportar a **Rotação de Chaves** sem quebrar a leitura de mensagens históricas retidas nas filas que foram criptografadas com chaves antigas, a gem utiliza um Key Provider estruturado. Ele empacota a mensagem em um envelope de metadados contendo o ID da chave ativa (`_key_id`) usada no momento da gravação:

```ruby
require 'openssl'
require 'base64'
require 'json'

module SharedBroker
  class Encryptor
    def initialize(key_provider)
      @key_provider = key_provider
    end

    def encrypt(topic, raw_payload)
      # Captura o par (Chave ID e Bytes da Chave) ativo para o topico correspondente
      key_id, key_bytes = @key_provider.active_key_for(topic)
      
      cipher = OpenSSL::Cipher.new('aes-256-gcm').encrypt
      cipher.key = key_bytes
      iv = cipher.random_iv
      
      encrypted_data = cipher.update(raw_payload) + cipher.final
      tag = cipher.auth_tag

      # Monta o envelope com metadados e marcacao da versao de chave utilizada
      JSON.generate({
        _key_id: key_id,
        iv: Base64.strict_encode64(iv),
        tag: Base64.strict_encode64(tag),
        data: Base64.strict_encode64(encrypted_data)
      })
    end

    def decrypt(envelope_str)
      envelope = JSON.parse(envelope_str, symbolize_names: true)
      key_id = envelope[:_key_id]
      
      # Busca a chave correspondente (mesmo que antiga/rotacionada) para decodificar
      key_bytes = @key_provider.find_key(key_id)
      
      decrypter = OpenSSL::Cipher.new('aes-256-gcm').decrypt
      decrypter.key = key_bytes
      decrypter.iv = Base64.strict_decode64(envelope[:iv])
      decrypter.auth_tag = Base64.strict_decode64(envelope[:tag])
      
      decrypter.update(Base64.strict_decode64(envelope[:data])) + decrypter.final
    end
  end
end
```

Com o envelope de metadados, a migração e rotação de segredos em produção acontece de forma suave, sem causar incidentes de quebras na decodificação de dados antigos.

### Termos técnicos desmistificados
- **AES-256-GCM:** Padrão de criptografia simétrica avançado que fornece confidencialidade e autenticidade de dados de forma altamente eficiente.
- **Key Rotation (Rotação de Chaves):** O processo de trocar as chaves criptográficas ativas periodicamente para reduzir os riscos de interceptações maliciosas.
- **Envelope Encryption:** Padrão de segurança onde dados são criptografados com uma chave de dados específica, e os detalhes estruturais daquela chave são anexados ao pacote de dados.
