---
title: "Recuperação de Desastres: Operando Mensagens Falhas com o DLQ Redriver Utility"
excerpt: "Filas de falhas (DLQ) guardam mensagens corrompidas, mas como as reprocessamos? Aprenda a desenhar e operar um Redriver automatizado na gem SharedBroker."
category: "Operações & Resiliência"
date: "26 de Junho, 2026"
readTime: "5 min de leitura"
author: "Wesley Lima"
series: "shared-broker-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/shared_broker"
---

## Quando a Fila Falha: O Papel e o Limite da DLQ

Em posts anteriores da série, abordamos como tratar instabilidades temporárias em microsserviços por meio de retries e recuo exponencial. Mas o que acontece quando o erro é permanente? Um bug em um validador de campos ou uma mudança não documentada de schema fará com que todas as mensagens da fila falhem repetidamente.

Quando isso ocorre, a política de resiliência isola essas mensagens corrompidas enviando-as para a **Dead Letter Queue (DLQ)**. 

A DLQ impede que mensagens problemáticas travem o consumo do canal de produção principal (evitando o efeito de *head-of-line blocking*). Porém, apenas armazenar erros não resolve o problema de negócio. Uma vez que o time de engenharia corrige o bug e realiza o deploy do hotfix, precisamos de uma forma de devolver essas mensagens à fila de origem para que sejam reprocessadas com sucesso.

Para automatizar essa tarefa sem intervenções manuais em bancos de dados ou scripts caseiros, a gem **SharedBroker** oferece o **DLQ Redrive Utility**.

---

## O Design do DLQ Redriver

Mover mensagens de volta (Redrive) exige cuidado. Não queremos criar loops infinitos se as mensagens continuarem quebrando, nem sobrecarregar o broker. O Redriver da gem lê as mensagens da DLQ em lotes (batch), valida-as novamente e as republica no tópico de destino original, com controle de limite de mensagens (`limit`).

### Implementando a Lógica do Redriver

```ruby
module SharedBroker
  module DLQ
    class Redriver
      def self.redrive(client, dlq_queue, destination_topic, limit: 100)
        # 1. Recupera as mensagens pendentes da DLQ com limite de lote
        messages = client.adapter.fetch_dlq_messages(dlq_queue, limit: limit)
        
        counter = 0
        messages.each do |message|
          # Remove os cabeçalhos de metadados de erro acoplados da falha anterior
          clean_payload = extract_payload(message)
          
          # 2. Republica no tópico original reprocessando o fluxo de validação e criptografia
          client.publish(destination_topic, clean_payload)
          
          # 3. Confirma o processamento para remover a mensagem antiga da DLQ
          client.adapter.acknowledge_dlq_message(dlq_queue, message)
          counter += 1
        end

        Rails.logger.info("[SharedBroker] Redrive concluído: #{counter} mensagens reprocessadas.")
        counter
      end

      private

      def self.extract_payload(message)
        # Remove do envelope os metadados de falha como :failed_at, :error_class, etc.
        envelope = JSON.parse(message, symbolize_names: true)
        envelope.reject { |key, _| [:failed_at, :exception_class, :exception_message].include?(key) }
      end
    end
  end
end
```

---

## Operando o Redrive no Dia a Dia

Uma das melhores práticas para expor essa capacidade de recuperação em produção de forma segura é encapsular a ação em uma tarefa administrativa do Rails (Rake Task). Isso permite que engenheiros e operadores de sistemas disparem o reprocessamento de forma segura pelo console ou via pipelines:

### Criando a Rake Task de Redrive

```ruby
# lib/tasks/shared_broker.rake

namespace :shared_broker do
  desc "Processa e envia mensagens da DLQ de volta para a fila original de consumo"
  task :redrive, [:dlq_queue, :topic, :limit] => :environment do |_, args|
    dlq_queue = args[:dlq_queue] || raise("Nome da fila de DLQ obrigatorio.")
    topic     = args[:topic]     || raise("Topico de destino obrigatorio.")
    limit     = (args[:limit]    || 50).to_i

    puts "Iniciando redrive de #{limit} mensagens da DLQ '#{dlq_queue}' para o topico '#{topic}'..."
    
    processed = SharedBroker::DLQ::Redriver.redrive(
      SPOT_BROKER, 
      dlq_queue, 
      topic, 
      limit: limit
    )

    puts "Sucesso! #{processed} mensagens foram movidas com sucesso."
  end
end
```

Para executar o comando em produção:

```bash
$ bundle exec rails "shared_broker:redrive[my_consumption_queue.dlq, user.created, 100]"
```

---

## Conclusão

Ter uma estratégia de Dead Letter Queue é apenas metade da solução de resiliência. A capacidade de reprocessar mensagens de forma auditada e limpa por meio de ferramentas como o `DLQ Redriver` é o que diferencia sistemas frágeis de arquiteturas prontas para produção e tolerantes a falhas reais.

### Termos Técnicos Desmistificados
- **Head-of-Line Blocking:** Bloqueio onde a primeira mensagem com falha na fila impede o processamento de todas as mensagens subsequentes saudáveis.
- **Acknowledge (Ack):** Confirmação enviada ao broker de que a mensagem foi processada com sucesso, autorizando sua remoção definitiva da fila.
- **Redrive:** O ato de mover mensagens falhas de uma DLQ de volta para a fila ou tópico de origem para nova tentativa de processamento.
---
