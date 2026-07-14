---
title: "A Evolução do GVL e GIL: Do Ruby 1.8 aos Ractors e o Fim das Travas Globais"
excerpt: "Entenda a história por trás do GIL e do GVL, a transição de Green Threads para OS Threads no Ruby e como Ractors e o ecossistema moderno buscam a verdadeira execução paralela."
category: "Ruby & Rails"
date: "14 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "ruby-rails-internals-series"
seriesIndex: 2
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## A origem: GIL vs. GVL

Embora muitas vezes usados como sinônimos, **GIL (Global Interpreter Lock)** e **GVL (Global VM Lock)** possuem distinções históricas importantes no ecossistema Ruby.

No **Ruby 1.8** e anteriores, o interpretador (conhecido como MRI - Matz's Ruby Interpreter) utilizava *Green Threads*. O Ruby simulava múltiplas threads no nível do interpretador, mas o sistema operacional enxergava apenas uma única thread real. A trava que gerenciava a alternância dessas threads simuladas era apropriadamente chamada de **GIL** (Global Interpreter Lock), pois ela controlava o interpretador inteiro.

A grande mudança ocorreu no **Ruby 1.9** com a introdução da máquina virtual **YARV (Yet Another Ruby VM)** desenvolvida por Koichi Sasada. A partir do 1.9, o Ruby passou a usar threads nativas do sistema operacional (POSIX threads). Como a concorrência agora era delegada ao kernel do SO, a trava global foi reprojetada para proteger apenas as estruturas internas da Máquina Virtual do Ruby (YARV) contra corrupção de memória. Assim, o GIL foi renomeado para **GVL (Global VM Lock)**.

---

## O mecanismo de preempção temporal (time-slicing)

No Ruby 1.9 até o Ruby 2.5, o GVL controlava a execução alternando a posse da trava entre as threads de maneira simples: a thread ativa executava por um limite de tempo (geralmente 100ms) antes que uma thread sinalizadora de timer solicitasse a liberação do GVL para permitir que outras threads concorrentes rodassem.

A partir do **Ruby 2.6**, o algoritmo do GVL foi refinado para evitar a "degradação por contenção", reduzindo o overhead de troca de contexto entre threads CPU-bound e I/O-bound.

```ruby
# Simulação conceitual de concorrência com troca de contexto cooperativa/preemptiva
class WorkerPool
  def initialize(tasks)
    @tasks = tasks
  end

  # Abordagem limpa sem loops aninhados profundos
  def process_all
    @tasks.each do |task|
      next if task.completed?

      # Processa cooperativamente liberando o controle
      task.execute
      Thread.pass 
    end
  end
end
```

---

## Ruby 3.0+: Ractors e concorrência sem GVL compartilhado

A grande revolução na concorrência do Ruby veio com a versão 3.0 e a introdução dos **Ractors** (antigamente chamados de Guilds). 

Diferente das threads tradicionais, cada Ractor possui o seu próprio GVL independente. Isso significa que dois Ractors podem rodar em paralelo em núcleos de CPU diferentes sem que um bloqueie o outro.

```ruby
# Criando paralelismo real com Ractors no Ruby 3
ractor_one = Ractor.new do
  # Este Ractor possui seu próprio GVL isolado
  results = (1..10_000_000).reduce(:+)
  Ractor.yield(results)
end

ractor_two = Ractor.new do
  # Executa concorrentemente em outro núcleo do processador
  results = (1..10_000_000).reduce(:+)
  Ractor.yield(results)
end

# Coletando os resultados sem estado mutável compartilhado
val_one = ractor_one.take
val_two = ractor_two.take
```

### Por que Ractors eliminam a necessidade de um GVL global?

1. **Sem Estado Compartilhado por Padrão**: Ractors não compartilham objetos mutáveis comuns. Se você tentar acessar uma variável mutável global de dentro de um Ractor, o Ruby levantará um erro imediato.
2. **Comunicação por Mensagens**: Os dados devem ser passados por cópia profunda (`deep_copy`) ou movendo a propriedade do objeto de um Ractor para o outro, mantendo a integridade da memória sem travas globais.

---

## O futuro: a remoção completa do lock global?

Assim como a comunidade Python está implementando a remoção do GIL de forma opcional (PEP 703), o time principal do Ruby trabalha continuamente para tornar a VM segura contra threads sem travas globais de forma transparente. Até que isso seja totalmente viável e maduro, os Ractors continuam sendo o caminho oficial do Ruby moderno para paralelismo de CPU, enquanto o ecossistema de Fibers assíncronos (e o Falcon Web Server) resolve com maestria a latência de I/O em aplicações Rails.
