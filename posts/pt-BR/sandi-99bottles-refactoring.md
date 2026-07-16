---
title: "99 Bottles of OOP: O Segredo da Refatoração Sem Medo"
excerpt: "Como refatorar sem quebrar o sistema? Aprenda as técnicas fundamentais de Sandi Metz baseadas em 'Shameless Green', passos microscópicos e as Flocking Rules."
category: "Design Patterns"
date: "16 de Julho, 2026"
readTime: "8 min de leitura"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## A arte de dar passos pequenos

Muitos engenheiros de software falham ao refatorar porque tentam reescrever grandes blocos de código de uma só vez. O resultado? Um mar de testes vermelhos quebrados e frustração. 

No livro *99 Bottles of OOP*, Sandi Metz ensina que a refatoração bem-sucedida baseia-se em **passos microscópicos e reversíveis**, mantendo o código funcionando em cada etapa. A regra de ouro é simples: **nunca escreva código novo enquanto refatora e nunca refatore enquanto escreve código novo**.

---

## Primeiro passo: o \"Shameless Green\" (verde sem vergonha)

Antes de falarmos de padrões de projeto e abstrações refinadas, Sandi Metz introduz o conceito de **Shameless Green**. A ideia é escrever o código mais rápido, simples e direto possível (mesmo que pareça "feio" ou contenha duplicações óbvias) apenas para colocar todos os testes em verde.

O maior erro de design é tentar antecipar abstrações e criar polimorfismo ou herança antes de ter dados empíricos suficientes sobre as reais variações do comportamento. O "Shameless Green" é o seu ponto de partida seguro:

```ruby
# Shameless Green: Código direto, duplicado, mas passando nos testes
class SongVerse
  def lyrics(number)
    if number.zero?
      "No more bottles of beer on the wall."
    elsif number == 1
      "1 bottle of beer on the wall."
    else
      "#{number} bottles of beer on the wall."
    end
  end
end
```

---

## O ciclo da refatoração segura

Com os testes verdes, seguimos o ciclo estrito de refatoração passo a passo:
1. **Identifique a menor duplicação ou má-definição**.
2. **Faça a alteração mais simples possível** (passo microscópico).
3. **Rode os testes imediatamente**. Se passar, avance; se falhar, desfaça a alteração imediatamente.

---

## Aplicando as flocking rules

Para transformar o nosso código "Shameless Green" em um design polimórfico elegante sem adivinhações, aplicamos as **Flocking Rules** (Regras de Agrupamento) propostas por Sandi:

1. **Selecione os condicionais que parecem similares**.
2. **Identifique a menor diferença entre eles**.
3. **Faça uma alteração estrutural para tornar as ramificações idênticas** (ex: parametrizar o valor que varia).
4. **Extraia o código comum para uma nova classe ou método polimórfico** apenas quando os condicionais forem estruturalmente idênticos.

```ruby
# Aplicando as Flocking Rules: Extraindo classes polimórficas de forma estruturada
class BottleNumber
  def self.for(number)
    return BottleNumberZero.new if number.zero?
    return BottleNumberOne.new if number == 1

    new(number)
  end

  def initialize(number)
    @number = number
  end

  def quantity
    @number
  end
end

class BottleNumberZero < BottleNumber
  def quantity
    "no more"
  end
end

class BottleNumberOne < BottleNumber
  def quantity
    "1"
  end
end
```

### O resultado

Ao extrair a lógica variante para classes dedicadas (`BottleNumberZero`, `BottleNumberOne`), o fluxo principal da música se livra de condicionais complexos. Se um novo requisito surgir amanhã (ex: "comportamento customizado para o número 6"), você só precisa adicionar uma nova classe sem alterar ou colocar em risco a lógica existente.
