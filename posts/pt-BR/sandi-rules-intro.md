---
title: "As 4 Regras de Design da Sandi Metz: Praticidade sem Compromisso no Rails"
excerpt: "Seu model ou controller está gordo demais? Conheça as 4 regras de tamanho e escopo propostas por Sandi Metz para garantir um design de software sustentável e legível no Rails."
category: "Design Patterns"
date: "15 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Simplificando o caos no Rails

À medida que uma aplicação Rails cresce, é muito comum que controllers acumulem regras de negócio indesejadas e que models do ActiveRecord se transformem em arquivos com milhares de linhas de código difícil de testar (o famoso padrão *Fat Model*).

Para combater esse problema, a renomada desenvolvedora **Sandi Metz** sugeriu quatro regras básicas de escopo e tamanho de arquivo. Embora pareçam restritivas à primeira vista, elas não foram criadas para serem prisões dogmáticas, mas sim **disparadores de reflexão**. Quando você viola uma dessas regras, o interpretador do Ruby não quebra, mas o seu design acende um sinal de alerta vermelho.

---

## As 4 regras de ouro

1. **Classes não devem ter mais de 100 linhas de código.**
2. **Métodos não devem ter mais de 5 linhas de código.**
3. **Métodos não devem aceitar mais de 4 argumentos** (e preferencialmente usar argumentos nomeados ou hashes de opções para evitar dependência de ordem).
4. **Controllers devem instanciar no máximo um objeto para passar para a view.**

### Aprofundando a regra do controller (apenas 1 objeto)

A quarta regra é uma das mais violadas no ecossistema Rails. Normalmente, criamos controllers que expõem 3 ou 4 variáveis de instância para a view (ex: `@user`, `@orders`, `@payment_methods`). Isso faz com que a View fique acoplada ao formato e banco de dados de múltiplos objetos, quebrando a barreira de abstração.

Sandi sugere usar um **Facade** ou um **View Object** (também chamado de *Presenter*) para encapsular todas essas informações em um único objeto coerente.

```ruby
# Antes: Controller violando a quarta regra de Sandi Metz
class DashboardController < ApplicationController
  def show
    @user = current_user
    @orders = current_user.orders.limit(5)
    @notifications = current_user.notifications.unread
  end
end
```

Refatorando com um View Object/Presenter, o controller passa apenas uma entidade e a view consome métodos estruturados:

```ruby
# app/presenters/dashboard_presenter.rb
class DashboardPresenter
  def initialize(user)
    @user = user
  end

  def user_name
    @user.name
  end

  def recent_orders
    @user.orders.limit(5)
  end

  def unread_notifications
    @user.notifications.unread
  end
end

# Depois: Controller respeitando a regra
class DashboardController < ApplicationController
  def show
    @dashboard = DashboardPresenter.new(current_user)
  end
end
```

---

## Aplicando a regra na prática (refatoração de método)

Imagine um cenário comum: processar um pedido de compras e enviar notificações. Veja como um método tende a crescer e acumular responsabilidades:

```ruby
# Antes: Acumulando responsabilidades e ultrapassando 5 linhas
class Order
  def process_and_notify(user, gateway)
    return false unless user.active?
    
    transaction do
      update!(status: :processed)
      payment = gateway.charge(total)
      user.notifications.create!(message: "Payment of #{total} approved")
      OrderMailer.receipt(self).deliver_later
    end
    true
  end
end
```

Seguindo as regras de Sandi Metz (métodos curtos, SRP e early returns), delegamos as ações de negócio para classes focadas e simplificamos o fluxo principal:

```ruby
# Depois: Métodos curtos (< 5 linhas) e responsabilidade única
class ProcessOrder
  def self.call(order, gateway)
    new(order, gateway).call
  end

  def initialize(order, gateway)
    @order = order
    @gateway = gateway
  end

  def call
    return false unless customer_active?

    execute_payment_flow
  end

  private

  def customer_active?
    @order.user.active?
  end

  def execute_payment_flow
    ActiveRecord::Base.transaction do
      @order.update!(status: :processed)
      @gateway.charge(@order.total)
      notify_customer
    end
    true
  end

  def notify_customer
    @order.user.notifications.create!(message: "Payment approved")
    OrderMailer.receipt(@order).deliver_later
  end
end
```

---

## Por que seguir essas regras?

* **Testabilidade Imediata**: Testar um método de 3 ou 4 linhas que faz apenas uma coisa é trivial. Você elimina a necessidade de setups de testes gigantescos.
* **Composição Natural**: Quando você é forçado a quebrar classes em menos de 100 linhas, você naturalmente começa a criar Service Objects, Form Objects e Query Objects menores e focados, em vez de inflar os models do Rails.
* **Legibilidade**: Métodos curtos reduzem drasticamente a carga mental de quem lê o código, permitindo entender o fluxo principal do software num piscar de olhos.
