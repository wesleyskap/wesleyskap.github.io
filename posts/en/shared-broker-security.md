---
title: "Secure Boundaries: Payload Validation (dry-schema and HTTP Registry), AES-256-GCM Encryption, and Key Rotation"
excerpt: "How do you guarantee contract integrity and security for sensitive data? Learn about payload validation and encryption with rotating keys."
category: "Security"
date: "June 02, 2026"
readTime: "6 min read"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## Ensuring Data Integrity and Security Across Network Boundaries

In event-driven architectures, payload contracts are critical. If a service alters a field type without warning (such as changing a variable from `integer` to `string`), consuming microservices will crash.

Furthermore, messages passing through shared brokers (such as public Redis or Kafka instances) can contain sensitive information (PII, financial data, tokens). These payloads must be encrypted to prevent data leakage.

The **SharedBroker** gem addresses both problems by combining dynamic schema validations (local and remote) with an automated **AES-256-GCM** encryption layer featuring **Key Rotation**.

## Validating Contracts Dynamically (dry-schema & JSON Schema)

The gem validates structural integrity at the outbound (`publish`) and inbound (`subscribe`) boundaries. Locally, we leverage `dry-schema` for fast, lightweight checks:

```ruby
require 'dry-schema'

module SharedBroker
  module Validation
    def self.validate!(topic, payload)
      schema = Registry.find(topic)
      return true unless schema

      result = schema.call(payload)
      unless result.success?
        raise "Invalid contract for topic #{topic}: #{result.errors.to_h}"
      end
    end
  end
end
```

For large-scale distributed setups, the gem supports fetching JSON Schemas dynamically from a remote registry (`SchemaRegistry::Providers::Http`), utilizing local TTL caching to eliminate network validation latency.

## AES-256-GCM Encryption and Key Rotation

The gem automatically encrypts payloads using the **AES-256-GCM** cipher.

To support **Key Rotation** without breaking historical messages in the queues encrypted with older key versions, the gem utilizes a Key Provider Registry. It packages the payload in a metadata envelope containing the ID of the active key (`_key_id`) used during encryption:

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
      # Fetches the active key ID and raw key bytes for the topic
      key_id, key_bytes = @key_provider.active_key_for(topic)
      
      cipher = OpenSSL::Cipher.new('aes-256-gcm').encrypt
      cipher.key = key_bytes
      iv = cipher.random_iv
      
      encrypted_data = cipher.update(raw_payload) + cipher.final
      tag = cipher.auth_tag

      # Compiles the envelope detailing the key ID
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
      
      # Fetches the matching historical key
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

Using key-versioned envelopes, secret migration in production happens smoothly without causing decoding failures for unprocessed legacy payloads.

### Technical Terms Demystified
- **AES-256-GCM:** An authenticated symmetric encryption standard providing high-speed data confidentiality and authenticity verification.
- **Key Rotation:** The operational security practice of changing cryptographic keys periodically to limit potential exposure.
- **Envelope Encryption:** A security practice where payloads are encrypted with a data key, and details pointing to that key are bundled with the message.
---
