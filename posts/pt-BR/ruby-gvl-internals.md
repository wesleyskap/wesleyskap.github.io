---
title: "Desmistificando o GVL (Global VM Lock) do Ruby: Mitos, Verdades e Concorrência"
excerpt: "O que é o GVL (Global VM Lock) e como ele realmente afeta o paralelismo e a concorrência na sua aplicação Ruby e Rails? Conheça os bastidores do runtime do MRI."
category: "Ruby & Rails"
date: "13 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "ruby-rails-internals-series"
seriesIndex: 1
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## Concorrência vs. paralelismo no MRI

Muitos desenvolvedores Rails iniciantes acreditam que o Ruby é puramente single-threaded devido ao **GVL (Global VM Lock)**. A realidade é mais sutil: o Ruby suporta threads nativas do sistema operacional (POSIX threads), mas o GVL garante que apenas uma thread execute instruções Ruby (código interpretado) por vez dentro de um mesmo processo.

Essa limitação existe historicamente para proteger as estruturas internas do interpretador padrão (MRI) contra race conditions, eliminando a necessidade de travas complexas de memória em nível de C. Mas isso significa que threads são inúteis no Ruby? Absolutamente não.

---

## O GVL é liberado no bloqueio de I/O

O GVL é um bloqueio inteligente. Toda vez que uma thread Ruby realiza uma operação de I/O bloqueante (como ler do banco de dados, enviar uma requisição HTTP externa ou aguardar escrita em disco), o MRI libera o GVL para que outras threads executem código Ruby enquanto o kernel do SO processa o I/O.

### Exemplo prático: I/O vs. CPU bound

Vamos analisar dois cenários. O primeiro é puramente matemático (CPU Bound), onde o GVL atua como um gargalo:

```ruby
# Exemplo CPU Bound
def compute_factorial(number)
  return 1 if number <= 1

  (1..number).reduce(:*)
end

# Execução sequencial vs Threads no cálculo matemático
# Threads não trazem ganho de performance aqui devido ao GVL.
threads = 4.times.map do
  Thread.new { compute_factorial(100_000) }
end
threads.each(&:join)
```

No entanto em um cenário de I/O Bound (o caso comum do Rails: requisições ao banco, APIs externas, cache), as threads escalam de forma quase linear:

```ruby
require "net/http"

# Exemplo I/O Bound
def fetch_api_status(url)
  uri = URI(url)
  # O GVL é liberado durante a conexão e leitura HTTP pelo kernel
  response = Net::HTTP.get_response(uri)
  
  response.code
rescue SocketError => e
  # Mensagens de exceção claras contendo o valor ofensor
  raise ConnectionError.new(offending_url: url), "Failed to connect to #{url}: #{e.message}"
end

urls = [
  "https://api.github.com",
  "https://api.slack.com",
  "https://api.stripe.com"
]

# Executando chamadas concorrentes usando threads
threads = urls.map do |url|
  Thread.new { fetch_api_status(url) }
end
threads.each(&:join)
```

Enquanto a Thread 1 aguarda a resposta do GitHub na rede, o GVL é liberado e a Thread 2 pode imediatamente começar a preparar a chamada para o Slack.

---

## Como o Rails se beneficia disso?

Servidores web multithreaded para Rails (como o **Puma**) utilizam essa exata característica. Se o seu controller faz consultas complexas ao Postgres ou chama microsserviços via HTTP, um único processo Puma configurado com 5 threads conseguirá processar múltiplos requests concorrentemente, pois o GVL estará sendo constantemente liberado enquanto as threads esperam pelo banco de dados.

### Boas práticas de design sob o GVL

1. **Evite compartilhar estado mutável**: Threads no Ruby compartilham o mesmo espaço de memória. Utilize estruturas de dados imutáveis ou encapsule estado thread-safe usando `Thread.current` com moderação ou bibliotecas dedicadas de concorrência.
2. **Delegue CPU Bound para Background Jobs separados**: Processamentos pesados de imagens, criptografia ou relatórios analíticos complexos não devem rodar na thread de request. Mova-os para workers (como Sidekiq ou Solid Queue) para evitar que o GVL trave outras threads de I/O do servidor Puma.
3. **Explore Ractors para paralelismo real**: A partir do Ruby 3, o mecanismo de **Ractors** permite paralelismo real de CPU sem GVL compartilhado, isolando o estado e trocando dados estritamente por passagem de mensagens.
