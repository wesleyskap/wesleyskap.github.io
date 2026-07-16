---
title: "POODR na Prática: Single Responsibility e Acoplamento Saudável"
excerpt: "Como criar classes fáceis de mudar? Descubra os ensinamentos práticos de POODR de Sandi Metz sobre responsabilidade única, injeção de dependências e a Lei de Demeter."
category: "Design Patterns"
date: "16 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Projetando para a mudança

Em seu aclamado livro *Practical Object-Oriented Design in Ruby* (POODR), Sandi Metz define o código bem desenhado não como aquele que é perfeito no primeiro dia, mas sim o que é **fácil de mudar** no futuro.

A facilidade de mudança apoia-se em dois pilares fundamentais da orientação a objetos: **Single Responsibility Principle (SRP)** e o **Gerenciamento de Dependências**.

---

## Single Responsibility Principle (SRP)

Uma classe deve ter apenas um motivo para mudar. Se você precisa descrever o que a classe faz usando conjunções ("e", "ou"), ela provavelmente tem responsabilidades demais.

No Rails, é comum vermos models carregando regras de negócio e formatação ao mesmo tempo. A solução sugerida por POODR é isolar essas regras em objetos menores (POROs) ou delegar a responsabilidade para quem realmente é dono dela.

---

## Injeção de dependências (DI)

Acoplamento rígido é o inimigo número um da refatoração. Quando a classe `A` instancia diretamente a classe `B` internamente, ela herda todas as dependências e limitações de `B`.

```ruby
# Antes: Acoplamento rígido (inviabiliza testes unitários e futuras substituições)
class NotificationSender
  def deliver(message)
    # Instanciação direta cria dependência rígida da API do Twilio
    client = Twilio::REST::Client.new
    client.messages.create(body: message, to: "+1234567")
  end
end
```

A solução de Sandi Metz é simples: **injete a dependência**. Passe o objeto colaborador pronto como argumento para o construtor ou para o método.

```ruby
# Depois: Injeção de dependência via parâmetro
class NotificationSender
  def initialize(client: Twilio::REST::Client.new)
    @client = client
  end

  def deliver(message, target)
    @client.messages.create(body: message, to: target)
  end
end
```

### Por que essa mudança é revolucionária?

1. **Testes Sem Dor**: Agora você pode testar `NotificationSender` passando um mock simples (um *double* ou objeto falso) em vez de precisar inicializar ou simular a biblioteca inteira do Twilio nos seus testes unitários.
2. **Substituição Transparente**: Se amanhã você decidir trocar o Twilio pelo SendGrid para enviar certas mensagens, a classe `NotificationSender` permanece intacta. Você apenas injeta um adaptador diferente que responda à mesma interface pública (`messages.create`).

---

## A Lei de Demeter (Law of Demeter)

Outro tema amplamente detalhado por Sandi Metz em POODR é o acoplamento de mensagens que violam a **Lei de Demeter** (frequentemente resumida como "fale apenas com seus amigos próximos"). 

No Rails, é extremamente comum ver cadeias de chamadas longas que quebram o encapsulamento:

```ruby
# Antes: Violação clássica da Lei de Demeter (alto acoplamento de estrutura de objetos)
class Invoice
  def customer_phone
    # A classe Invoice precisa saber que Customer tem um Profile e que Profile tem um Phone
    customer.profile.phone
  end
end
```

Se a estrutura de `Profile` mudar, a classe `Invoice` quebra de forma silenciosa. Para resolver isso usando as técnicas de POODR, ocultamos a estrutura interna usando delegação (ou o método `delegate` do Rails):

```ruby
# Depois: Ocultando a estrutura interna através de delegação limpa
class Invoice
  belongs_to :customer

  # Delega a mensagem diretamente
  delegate :phone, to: :customer, prefix: true
end

class Customer
  has_one :profile

  # Delega para o profile de forma oculta
  delegate :phone, to: :profile
end
```

Agora, chamamos apenas `@invoice.customer_phone`. A classe `Invoice` fala apenas com seu "amigo próximo" (`customer`), mantendo a independência e resiliência da codebase contra alterações futuras em sub-estruturas.
