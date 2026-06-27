---
title: "Desacoplamento e Alta Disponibilidade na Recorrência: Introduzindo o SDK vindi-rails"
excerpt: "Conecte sua aplicação Rails à plataforma de cobrança recorrente da Vindi de forma thread-safe, com suporte a multi-tenancy dinâmico, cache embutido e retries inteligentes."
category: "Fintech & Integrações"
date: "27 de Junho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/vindi-rails"
---

## O Desafio da Integração de Pagamentos

Em sistemas que operam sob o modelo de assinaturas e recorrência, a integração com o gateway de pagamento não é apenas uma funcionalidade secundária; é o coração financeiro da aplicação. Uma falha de comunicação ou um timeout durante a criação de uma cobrança pode gerar sérias inconsistências: clientes cobrados em duplicidade ou assinaturas ativas na plataforma de pagamento que não se refletem no banco de dados local.

Além disso, gateways de pagamento impõem limites de requisições (*rate limits*). Fazer chamadas síncronas para buscar informações que mudam raramente (como planos, formas de pagamento aceitas ou produtos) introduz latência desnecessária no fluxo do usuário final e consome sua cota de requisições de forma ineficiente.

O SDK `vindi-rails` foi projetado para mitigar esses problemas no ecossistema Ruby on Rails, oferecendo uma camada de abstração resiliente, *thread-safe* e com suporte nativo a cache.

---

## Arquitetura Baseada em Recursos e Segurança de Threads

Ao contrário de abordagens tradicionais que usam variáveis globais inseguras para gerenciar o estado da API, o `vindi-rails` adota um padrão de configuração desacoplado e seguro contra concorrência (*thread-safe*). Isso é fundamental para servidores web modernos (como Puma) que operam em ambientes multi-thread.

Para configurar o SDK globalmente, criamos o inicializador padrão da aplicação:

```ruby
Vindi.configure do |config|
  config.api_key = ENV['VINDI_API_KEY']
  config.api_url = 'https://gp.vindi.com.br/api/v1' # Padrão é Sandbox
end
```

### O Poder da Configuração Dinâmica (Multi-Tenancy)

Para aplicações SaaS onde múltiplos parceiros ou clientes (merchants) utilizam suas próprias credenciais da Vindi, o SDK oferece o método `with_config`. Ele permite isolar credenciais temporárias no escopo da thread atual de execução:

```ruby
# Executa chamadas de API com credenciais específicas de forma thread-safe
Vindi.with_config(api_key: 'chave_privada_do_merchant') do
  # Todas as requisições deste bloco usam a chave temporária
  clientes_do_merchant = Vindi::Customer.list
end

# Fora do bloco, a configuração global padrão é mantida automaticamente
```

Sob o capô, `with_config` gerencia as variáveis no nível do `Thread.current` da thread atual, garantindo isolamento total em processos altamente concorrentes.

---

## Redução de Latência por Caching Local

Chamar o gateway remoto a cada requisição web para listar os planos de assinatura disponíveis é uma má prática de engenharia. O `vindi-rails` permite delegar um provedor de cache (como o cache padrão do Rails) e especificar quais recursos dinâmicos devem ser armazenados temporariamente na memória:

```ruby
Vindi.configure do |config|
  config.cache_store = Rails.cache
  config.cache_ttl = 300 # 5 minutos de TTL
  config.cached_resources = [:plans, :payment_methods, :products]
end
```

Quando o cache está habilitado, chamadas como `Vindi::Plan.list` ou `Vindi::PaymentMethod.list` interceptam a requisição de rede e leem o resultado diretamente do armazenamento local se a chave de cache for válida. Isso reduz o tempo de resposta da API de centenas de milissegundos para menos de 5ms.

---

## Chamadas de API Inteligentes e Resilientes

Falhas temporárias de rede acontecem. O SDK protege a integridade do seu fluxo de execução aplicando retentativas automáticas (*automatic retries*) com recuo exponencial e ruído aleatório (*jitter*) quando encontra falhas de transporte ou limites excedidos (status HTTP `429 Too Many Requests`):

```ruby
Vindi.configure do |config|
  config.max_retries = 3
  config.retry_backoff_factor = 2
  config.retry_base_delay = 1.0 # Espera 1s, depois 2s, depois 4s...
end
```

Isso garante que problemas rápidos de rede não estourem exceções indesejadas no fluxo do cliente, melhorando sensivelmente a percepção de estabilidade do sistema.

---

## Termos Técnicos Desmistificados

*   **Thread-safe (Segurança de Threads):** Um bloco de código ou objeto que pode ser acessado de forma concorrente por múltiplos fluxos de execução (threads) simultaneamente sem causar corrupção de estado ou inconsistências de variáveis.
*   **Multi-tenancy:** Uma arquitetura de software onde uma única instância de software atende a múltiplos clientes (tenants ou inquilinos). No caso de pagamentos, permite gerenciar transações para diferentes contas integradas na mesma base de código.
*   **Rate Limits (Limites de Vazão):** Regras de restrição aplicadas por servidores de API para limitar o número de requisições que um cliente pode enviar em um determinado intervalo de tempo para evitar abuso e sobrecarga.
