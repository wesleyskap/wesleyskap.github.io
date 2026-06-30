---
title: "Otimização e idempotência:Compressão automática de payloads e middleware de deduplicação"
excerpt: "Grandes volumes de dados e duplicações de mensagens são desafios comuns em sistemas distribuídos. Aprenda a compactar payloads dinamicamente e garantir a idempotência no SharedBroker."
category: "Performance & Concorrência"
date: "22 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/shared_broker"
---
## Os desafios do volume e da duplicação de mensagens

Em sistemas distribuídos de alta vazão, a eficiência e a consistência são cruciais. Conforme nossas aplicações escalam, nos deparamos com dois problemas silenciosos, mas devastadores:
1. **Desperdício de Banda e Armazenamento:** O envio de payloads JSON grandes (como relatórios consolidados ou listagens estruturadas) infla o tráfego de rede e sobrecarrega a memória dos brokers.
2. **Processamento Duplicado (At-Least-Once Delivery):** Como a maioria dos brokers garante a entrega de mensagens "pelo menos uma vez", falhas temporárias de rede ou timeouts de confirmação fazem com que o mesmo evento seja consumido múltiplas vezes, arriscando inconsistências graves na base de dados (como faturar um pedido duas vezes).

Para resolver esses desafios, a gem **SharedBroker** oferece duas defesas integradas: **Compressão Automática de Payloads** e um **Middleware de Idempotência**.

---
## 1. compressão dinâmica e transparente de payloads

Em vez de comprimir manualmente os dados no código de domínio antes de publicar, o `SharedBroker` faz isso de forma transparente. Definimos um algoritmo (como `:gzip` ou `:deflate`) e um limite de tamanho (threshold) em bytes. Payloads que não atingem o limite passam sem alteração, evitando overhead computacional desnecessário para mensagens curtas.

### Como a compressão funciona por baixo dos panos

A gem empacota o payload em um envelope que sinaliza se houve compressão. Quando o subscriber recebe o evento, ele detecta a flag e realiza a descompressão automaticamente antes de passar o JSON de volta para o bloco de execução.

```ruby
require 'zlib'
require 'json'

module SharedBroker
  module Compression
    class Gzip
      def self.compress(data)
        # Comprime a string e retorna os bytes compactados
        io = StringIO.new
        gz = Zlib::GzipWriter.new(io)
        gz.write(data)
        gz.close
        io.string
      end

      def self.decompress(data)
        # Descomprime os bytes recebidos de volta para a string original
        io = StringIO.new(data)
        gz = Zlib::GzipReader.new(io)
        result = gz.read
        gz.close
        result
      end
    end
  end
end
```

### Configurando na aplicação

A ativação global no inicializador é simples e não exige mudanças nas chamadas de publicação ou consumo:

```ruby
SharedBroker.configure do |config|
  # Ativa compressão usando gzip
  config.compression_algorithm = :gzip
  # Define o limite em 1 KB (1024 bytes)
  config.compression_threshold = 1024
end
```

---
## 2. middleware de idempotência para consumidores

Garantir idempotência significa assegurar que, não importa quantas vezes o mesmo evento seja recebido, a ação correspondente seja executada apenas uma vez.

O `SharedBroker` implementa um padrão de middleware que intercepta as mensagens recebidas, calcula ou extrai um identificador único de correlação (`correlation_id`), e valida se ele já foi processado no armazenamento de cache configurado (como `Rails.cache` ou `Redis`).

### A lógica do middleware de deduplicação

```ruby
module SharedBroker
  module Middlewares
    class Idempotency
      def initialize(store:, expires_in: 86400)
        @store = store
        @expires_in = expires_in
      end

      def call(topic, queue_name, envelope)
        correlation_id = envelope[:correlation_id]
        
        # Se a mensagem não possui correlation_id, processa sem deduplicação
        return yield if correlation_id.nil?

        cache_key = "shared_broker:processed:#{queue_name}:#{correlation_id}"

        # Tenta registrar o ID no cache atomicamente
        if @store.write(cache_key, "processed", nx: true, expires_in: @expires_in)
          begin
            yield
          rescue => e
            # Em caso de erro no processamento, libera a chave do cache para retry
            @store.delete(cache_key)
            raise e
          end
        else
          # Ignora silenciosamente para evitar reprocessamento duplicado
          Rails.logger.info("[SharedBroker] Mensagem duplicada ignorada: #{correlation_id}")
        end
      end
    end
  end
end
```

### Registrando o middleware no client

No arquivo de inicialização do seu microsserviço:

```ruby
# Inicializa o middleware apontando para o cache do Rails
idempotency_middleware = SharedBroker::Middlewares::Idempotency.new(
  store: Rails.cache,
  expires_in: 86400 # Mantém o registro de controle por 24 horas
)

SPOT_BROKER = SharedBroker::Client.new(
  adapter: BROKER_ADAPTER,
  middlewares: [idempotency_middleware]
)
```

---
## Conclusão

Adotar compressão de payloads e middlewares de idempotência transforma o transporte de mensagens de uma simples "passagem de dados" para um fluxo inteligente, seguro e de alta performance. Com essas ferramentas nativas da gem `SharedBroker`, eliminamos os perigos de inconsistências de dados e otimizamos o consumo de rede em um único design limpo.

### Termos técnicos desmistificados
- **Deduplicação:** Processo de identificar e descartar duplicatas de mensagens idênticas em um fluxo contínuo.
- **nx: true:** Opção usada no cache para registrar uma chave apenas se ela ainda não existir na base de dados (operação atômica).
- **Correlation ID:** Um identificador exclusivo anexado a mensagens para rastrear fluxos de execução relacionados ou garantir a singularidade do processamento.
