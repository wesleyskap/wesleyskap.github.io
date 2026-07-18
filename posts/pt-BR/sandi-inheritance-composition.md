---
title: "Herança vs. Composição: Quando Duplicar é Melhor que Abstrair Errado"
excerpt: "Abstrações precoces criam acoplamentos rígidos e heranças confusas. Descubra os conselhos de Sandi Metz sobre composição, Concerns e o valor da duplicação."
category: "Design Patterns"
date: "18 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 5
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## A armadilha da abstração precoce

Um dos mantras mais famosos de Sandi Metz é: **"A duplicação é muito mais barata do que a abstração errada"**. 

Muitas vezes, ao ver duas linhas de código parecidas, criamos imediatamente uma herança ou módulo compartilhado (como `ActiveSupport::Concern` no Rails) para reaproveitá-lo. O problema é que no futuro quando os requisitos mudam de formas diferentes para cada contexto, a classe herdada se torna um monstro cheio de condicionais internos para acomodar exceções de comportamento.

---

## Herança (*is-a*) vs. composição (*has-a*)

* **Herança**: Modela relações onde um objeto **é** uma especialização de outro. A herança cria acoplamento rígido de dependência de código (qualquer mudança na classe pai afeta todas as subclasses).
* **Composição**: Modela relações onde um objeto **possui** ou delega para outro colaborador. É um acoplamento leve, flexível e baseado estritamente na interface pública.

### O perigo da herança mal planejada

Imagine uma hierarquia para exportar relatórios:

```ruby
# Antes: Herança gerando acoplamento de comportamento rígido
class Report
  def export
    prepare_data
    render_format
  end
end

class PdfReport < Report
  def render_format
    # Lógica específica de PDF
  end
end
```

Se precisarmos de um relatório que seja enviado por e-mail em vez de baixado diretamente, a estrutura de herança começa a quebrar ou exigir ramificações confusas. A solução de Sandi Metz é usar a **Composição**:

```ruby
# Depois: Composição baseada em injeção de adaptadores flexíveis
class Report
  def initialize(exporter:)
    @exporter = exporter
  end

  def export(data)
    # Delegação simples de comportamento
    @exporter.export(data)
  end
end

class PdfExporter
  def export(data)
    # Lógica isolada de exportação PDF
  end
end

class EmailExporter
  def export(data)
    # Lógica isolada de envio por e-mail
  end
end
```

---

## E quanto aos concerns e mixins do Rails?

No Rails, o uso de `ActiveSupport::Concern` para compartilhar código entre models é extremamente comum. No entanto, Sandi Metz adverte que **mixins e concerns são uma forma disfarçada de herança múltipla**.

Se você inclui um modulo `Commentable` no model `Post`, você está dizendo que `Post` *is-a* (é um) `Commentable`. Se o seu concern apenas injeta métodos aleatórios para diminuir o tamanho do arquivo do model principal, você está apenas varrendo a sujeira para debaixo do tapete. A complexidade continua lá, apenas dividida em arquivos diferentes.

Antes de criar um Concern, avalie se a lógica não deveria ser um objeto independente (composição):

```ruby
# Antes: Concern acoplando comportamento ao ciclo de vida do model
module Searchable
  extend ActiveSupport::Concern
  
  included do
    after_commit :index_in_elasticsearch
  end
  
  def index_in_elasticsearch
    # ...
  end
end
```

Em vez de acoplar o Elasticsearch ao ciclo de vida do model através de herança/mixins, use composição em um Service Object que gerencia o fluxo:

```ruby
# Depois: Composição encapsulada em um Service Object
class CreatePost
  def self.call(params)
    ActiveRecord::Base.transaction do
      post = Post.create!(params)
      IndexerService.index(post) # Dependência clara e explícita
      post
    end
  end
end
```

---

## Quando escolher cada um?

1. **Use composição por Padrão**: Se os comportamentos variam ou dependem de serviços externos, use composição. Ela permite injetar diferentes estratégias de execução e simplifica testes.
2. **Use Herança apenas para Hierarquias estritamente estáveis**: Se o comportamento variante é puramente um detalhe de especialização estável e bem definido no domínio (ex: subclasses matemáticas ou tipos estritos de dados do sistema), a herança pode ser aplicada com segurança.
Mantenha seu código modular, pronto para mudanças rápidas de requisitos e livre de hierarquias de herança impossíveis de desenredar no futuro.
