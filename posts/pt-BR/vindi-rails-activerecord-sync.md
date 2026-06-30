---
title: "Sincronização de estado sem costura:ActiveRecord model sync com vindi-rails-integrations"
excerpt: "Descubra como sincronizar modelos do ActiveRecord de forma transparente com a Vindi, tratando deleção lógica, atualizações em lote e auditorias de conciliação."
category: "Fintech & Integrações"
date: "29 de Junho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "vindi-rails-series"
seriesIndex: 3
referenceLink: "https://github.com/wesleyskap/vindi-rails-integrations"
---
## Sincronizar ou não sincronizar:O dilema do ActiveRecord

Quando integramos sistemas de faturamento recorrente, é comum precisarmos duplicar parte dos dados cadastrais dos nossos usuários. A Vindi precisa saber o nome, e-mail, CPF/CNPJ e um código de identificação do cliente para emitir notas fiscais e cobrar o cartão de crédito corretamente.

Manter essas duas bases de dados em sincronia de forma manual gera código repetitivo nos controllers e aumenta a chance de erros humanos. Se o usuário atualiza o e-mail no perfil da nossa aplicação, precisamos lembrar de disparar uma chamada de API para atualizar o mesmo e-mail na Vindi.

A gem de extensões [`vindi-rails-integrations`](https://github.com/wesleyskap/vindi-rails-integrations) resolve esse problema acoplando um Concern inteligente e automatizado aos modelos do ActiveRecord através do módulo `Vindi::Synchronizable`.

---
## Mapeamento automático com Vindi::Synchronizable

Para habilitar a sincronização automática em um modelo existente (por exemplo, `User`), iniciamos executando o gerador fornecido pelo ecossistema:

```bash
$ rails generate vindi:sync User
$ rails db:migrate
```

Este comando gera uma migração para adicionar a coluna `vindi_customer_id` (String) à tabela do modelo local e injeta as bases necessárias. No arquivo do modelo, incluímos o concern e customizamos o dicionário de atributos enviados para a API:

```ruby
class User < ApplicationRecord
  include Vindi::Synchronizable

  # Sobrescrevemos este método para formatar os parâmetros enviados à Vindi
  def vindi_customer_attributes
    {
      name: "#{first_name} #{last_name}".strip,
      email: email,
      registry_code: document_number, # CPF ou CNPJ limpo
      code: "user_#{id}"              # ID de referência interno
    }
  end
end
```

### O ciclo de vida da sincronização

A partir do momento em que o concern é incluído, o ciclo de vida do ActiveRecord passa a gerenciar a sincronização de forma transparente utilizando *callbacks*:

1.  **Ao Criar (`after_commit on: :create`)**: O SDK cria o cliente correspondente na Vindi, aguarda o retorno da API e grava o `vindi_customer_id` gerado de volta no seu banco de dados local.
2.  **Ao Atualizar (`after_commit on: :update`)**: O concern monitora modificações nos campos mapeados (como nome ou e-mail). Se houver alterações locais, uma chamada `Vindi::Customer.update` é disparada dinamicamente para atualizar a base externa.

---
## Segurança transacional e a sincronização em lote

Para evitar requisições de rede lentas durante transações críticas no banco local, é recomendável acoplar o Transactional Outbox (como abordado no post anterior). Se configurado com `config.use_outbox = true`, em vez de disparar a API síncrona nos callbacks, o concern salva a pendência na tabela `vindi_pending_syncs` na mesma transação atômica. Um job de segundo plano processa as filas de forma resiliente.

---
## Auditorias de consistência com rake tasks

Nenhuma integração distribuída é perfeita: redes falham temporariamente, transações sofrem rollback e intervenções manuais podem acontecer no painel administrativo da Vindi.

Para garantir que a base local e a base externa estejam sempre equivalentes, a gem oferece uma Rake task de auditoria e reconciliação automática:

```bash
$ bundle exec rake vindi:audit model=User
```

Esta tarefa faz uma varredura comparativa nas bases:

```text
Analyzing User database...
[Audit] Checking User ID: 102 (Vindi ID: 88762) - Match found.
[Audit] Checking User ID: 103 (Vindi ID: nil) - Missing in Vindi!
[Audit Warning] User ID 103 created in Vindi with customer ID 88763.
Reconciliation complete. 1 missing records synchronized.
```

Se o validador encontrar algum usuário sem `vindi_customer_id` ou cuja informação esteja inconsistente, a tarefa cria ou reconstrói o vínculo com segurança em tempo real.

---
## Termos técnicos desmistificados

*   **ActiveRecord Callbacks:** Pontos de gancho no ciclo de vida de um objeto do banco de dados (como validação, salvamento, persistência ou exclusão) onde códigos personalizados podem ser executados automaticamente.
*   **Conciliação de Dados:** O processo de comparar dois conjuntos de dados em sistemas diferentes para garantir que as informações estejam completas, corretas e consistentes entre as duas pontas.
*   **ActiveRecord Concern:** Um padrão de organização de código no Rails que permite extrair lógica modular e reutilizável (incluindo escopos, validações e callbacks) para ser compartilhada de forma limpa entre diferentes modelos.
