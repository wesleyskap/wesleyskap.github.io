---
title: "Nothing is Something: Eliminando Condicionais com o Null Object Pattern"
excerpt: "Cansado de encher seu código com verificações de nil? Aprenda como Sandi Metz usa o Null Object Pattern para substituir a ausência de dados por comportamento ativo."
category: "Design Patterns"
date: "17 de Julho, 2026"
readTime: "6 min de leitura"
author: "Wesley Lima"
series: "sandi-metz-design-series"
seriesIndex: 4
referenceLink: "https://github.com/wesleyskap/ruby-rails-internals"
---

## A tirania do `nil`

Um dos erros mais comuns de design é tratar a ausência de dados como um caso especial que exige lógica condicional. Em quase toda aplicação Rails, você encontra trechos de código como este:

```ruby
# Antes: Checagens constantes de nil (Carga mental e duplicação de IFs)
class ProjectController
  def show
    @project = Project.find(params[:id])
    
    # Checagem condicional poluindo o controller ou a view
    if @project.owner
      @owner_name = @project.owner.name
    else
      @owner_name = "Guest User"
    end
  end
end
```

Na sua famosa palestra *"Nothing is Something"*, Sandi Metz ensina que a ausência de algo ainda é **alguma coisa** (possui um significado de negócio). Em vez de checar se um objeto é nulo usando condicionais, devemos representar a "ausência" por meio de um **Null Object** (ou *Special Case*) que responda à mesma interface pública.

---

## Implementando o padrão Null Object

Criamos uma classe PORO dedicada a representar o usuário nulo/visitante, definindo os métodos necessários para retornar valores padrão e consistentes.

```ruby
# Null Object dedicado a representar o visitante sem cadastro
class NullUser
  def name
    "Guest User"
  end

  def active?
    false
  end

  # Null Objects devem retornar comportamentos neutros consistentes
  def roles
    []
  end
end
```

Agora, ajustamos a associação no model do Rails para retornar o nosso objeto nulo caso não haja um registro vinculado no banco de dados.

```ruby
# Model Rails encapsulando a inicialização do Null Object
class Project < ActiveRecord::Base
  belongs_to :owner, class_name: "User", optional: true

  # Substitui o retorno de nil por um Null Object ativo
  def owner
    super || NullUser.new
  end
end
```

### O resultado

Com essa alteração simples de design, eliminamos todos os condicionais do nosso código de visualização e controle. Agora podemos chamar `@project.owner.name` de forma direta e segura, sem riscos de estourar um erro fatal de `NoMethodError: undefined method 'name' for nil:NilClass`.

```ruby
# Depois: Código limpo e focado no comportamento
class ProjectController
  def show
    @project = Project.find(params[:id])
    @owner_name = @project.owner.name # Funciona de forma transparente
  end
end
```

Substituir checagens de `nil` por comportamento polimórfico ativo reduz bugs, simplifica as views e controllers do Rails e melhora a legibilidade do sistema.
---

## Null Object Pattern no ecossistema Rails

No Rails, uma alternativa comum para lidar com Null Objects em views é usar **Decorators** ou **Presenters**. Se você não quer poluir seus models do ActiveRecord alterando os retornos das associações padrão, você pode encapsular a lógica de exibição em uma classe Presenter:

```ruby
# app/presenters/project_presenter.rb
class ProjectPresenter
  def initialize(project)
    @project = project
  end

  # Retorna o owner real ou o NullUser de forma transparente para a view
  def owner
    @project.owner || NullUser.new
  end
end
```

Isso garante que a camada de persistência permaneça pura, enquanto a view consome dados higienizados e livres de estruturas condicionais de checagem de presença.
