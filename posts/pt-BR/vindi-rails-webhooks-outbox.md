---
title: "Garantia de entrega e eventos resilientes:Outbox transacional e webhooks no vindi-rails"
excerpt: "Como evitar inconsistências de pagamento causadas por timeouts de rede? Veja como implementar o Transactional Outbox Pattern e recebimento de Webhooks assíncronos no Rails."
category: "Fintech & Resiliência"
date: "28 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/vindi-rails-integrations"
---
## O risco das chamadas HTTP síncronas em transações de banco

Considere o seguinte cenário clássico em uma aplicação Ruby on Rails:

```ruby
ActiveRecord::Base.transaction do
  user = User.create!(user_params)
  
  # Chamada síncrona de rede dentro da transação de banco de dados
  vindi_customer = Vindi::Customer.create(name: user.name, email: user.email)
  
  user.update!(vindi_id: vindi_customer.id)
end
```

Este código carrega uma falha grave de design arquitetural. Se a rede oscilar ou a API da Vindi demorar 10 segundos para responder, a conexão com o banco de dados local da sua aplicação ficará travada (presa no bloco da transação), aumentando o risco de exaustão do pool de conexões (*connection pool exhaustion*). Se a chamada da API falhar após persistir o usuário localmente, a transação sofrerá *rollback*, mas o cliente poderá ter sido criado no gateway externo, gerando dados órfãos.

Para desacoplar as operações de banco de dados locais das comunicações externas de rede, a gem de extensões [`vindi-rails-integrations`](https://github.com/wesleyskap/vindi-rails-integrations) introduz suporte nativo a dois padrões arquiteturais de resiliência: o **Transactional Outbox** e o processamento assíncrono de **Webhooks**.

---
## O padrão transactional outbox com ActiveRecord

O padrão **Transactional Outbox** resolve a inconsistência entre banco de dados e APIs externas gravando a intenção de envio de dados em uma tabela auxiliar do mesmo banco de dados local, dentro da mesma transação atômica. 

O SDK facilita a configuração dessa estrutura por meio de geradores integrados:

```bash
$ rails generate vindi:outbox
```

Isso cria uma tabela `vindi_outbox_events` no banco de dados. Em vez de chamar a Vindi diretamente no fluxo principal, a aplicação cria o registro local e o evento outbox em um único comando ACID:

```ruby
ActiveRecord::Base.transaction do
  user = User.create!(user_params)
  
  # Registra o evento de sincronização no outbox local
  Vindi::Outbox.enqueue('Customer', :create, name: user.name, email: user.email, external_owner: user)
end
```

Um worker assíncrono em background (executado via Sidekiq, Solid Queue ou GoodJob) lê periodicamente a tabela de outbox, efetua a chamada HTTP para a API da Vindi e, em caso de sucesso, marca o evento como processado. Se a chamada falhar, o worker tenta novamente seguindo regras de backoff exponencial, garantindo a entrega *At-Least-Once* de forma completamente assíncrona.

---
## Webhooks seguros e despacho assíncrono

Webhooks são essenciais para sincronizar eventos que ocorrem diretamente na plataforma da Vindi (como faturas pagas, cartões rejeitados ou assinaturas canceladas) de volta para a sua aplicação Rails. Porém, receber webhooks de forma síncrona no controller principal adiciona riscos de segurança (como spoofing) e gargalos de processamento.

Para resolver isso, o gerador do SDK cria um endpoint seguro e desacoplado:

```bash
$ rails generate vindi:webhook
```

Esse gerador cria um controller especializado que:
1.  **Valida a Assinatura (Signature Verification):** Verifica se o payload recebido foi realmente enviado pela Vindi comparando o hash HMAC do cabeçalho com a chave secreta configurada.
2.  **Enfileira o Processamento:** Salva o evento e delega a execução da lógica de negócios para um job de segundo plano (`Vindi::WebhookJob`), respondendo imediatamente status `200 OK` para o servidor da Vindi.

### Handlers regidos por convenção

Para tratar os eventos de webhook de forma modular e limpa, você pode gerar classes de serviço focadas:

```bash
$ rails generate vindi:webhook_handler subscription_canceled
```

O comando cria uma classe estruturada para lidar especificamente com cancelamentos de assinatura:

```ruby
# App/services/vindi_webhook_handlers/subscription_canceled_handler.rb
module VindiWebhookHandlers
  class SubscriptionCanceledHandler
    def call(event_payload)
      vindi_subscription_id = event_payload.dig('data', 'subscription', 'id')
      assinatura = Subscription.find_by!(vindi_id: vindi_subscription_id)
      assinatura.update!(status: :canceled)
    end
  end
end
```

O `WebhookJob` principal identifica o tipo de evento recebido do webhook e despacha automaticamente a execução para o handler correspondente seguindo a convenção de nomes, mantendo seus controllers limpos e focados.

---
## Termos técnicos desmistificados

*   **Transactional Outbox Pattern:** Padrão que garante que alterações de estado no modelo de dados local e o disparo de eventos de integração externa aconteçam de forma atômica no banco de dados, evitando perdas de sincronia caso a comunicação de rede falhe.
*   **At-Least-Once Delivery (Entrega ao Menos Uma Vez):** Garantia de que um evento ou mensagem será entregue ao seu destino pelo menos uma vez, mesmo que isso exija múltiplas retentativas caso ocorram falhas temporárias.
*   **HMAC (Hash-based Message Authentication Code):** Um tipo específico de código de autenticação de mensagem obtido através de uma função criptográfica associada a uma chave secreta. Usado para provar a integridade e autenticidade de payloads enviados por webhooks.
