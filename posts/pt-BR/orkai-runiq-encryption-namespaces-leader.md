---
title: "Criptografia, isolamento multi-tenant e liderança distribuída:Segurança e alta disponibilidade no runiq"
excerpt: "Como proteger dados sensíveis em repouso, isolar centenas de clientes no mesmo cluster e garantir que apenas um worker lidere tarefas críticas — tudo sem infraestrutura externa."
category: "Segurança"
date: "05 de Julho, 2026"
readTime: "7 min de leitura"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Três desafios, uma base de código

Processadores de background em produção lidam com três problemas clássicos que raramente são resolvidos de forma integrada:

1. **Vazamento de dados:** Payloads de jobs podem conter PII, tokens ou chaves de API gravadas em texto puro no banco.
2. **Isolamento de inquilinos:** Um cluster compartilhado precisa segregar dados de clientes diferentes sem multiplar bancos.
3. **Single points of failure:** Tarefas de manutenção (crons, archival) executadas por múltiplas réplicas causam duplicação.

O Orkai Runiq resolve os três com soluções nativas e independentes de infraestrutura externa.

---

## Criptografia AES-256-GCM em repouso

O Runiq permite criptografar payloads no lado do cliente antes do envio e descriptografar transparentemente no worker, sem alterações de schema no banco de dados.

O sistema usa **AES-256-GCM** com um nonce aleatório de 12 bytes gerado via `crypto/rand`. O payload cifrado é prefixado com um cabeçalho mágico `runiq:enc:` para identificação automática:

```go
func EncryptPayload(plaintext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, ErrInvalidKey
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	return buildEncryptedBytes(nonce, ciphertext), nil
}
```

### Ativação no cliente e no worker

```go
// Cliente criptografa antes de enfileirar
client := queue.NewClient(storage,
	queue.WithClientPayloadEncryption(encryptionKey),
)

// Worker descriptografa antes de executar
pool := queue.NewWorkerPool(storage, 10,
	queue.WithWorkerPayloadEncryption(encryptionKey),
)
```

A verificação é automática: no momento da execução, o worker checa o header `runiq:enc:` e decide se precisa decriptar:

```go
func (w *WorkerPool) executeJob(ctx context.Context, env *JobEnvelope) {
	if IsEncrypted(env.Args) {
		dec, err := DecryptPayload(env.Args, w.encryptionKey)
		if err != nil {
			_ = w.storage.Fail(ctx, env.JobID,
				fmt.Errorf("failed to decrypt payload: %w", err))
			return
		}
		env.Args = dec
	}
	// prossegue com a execução normal...
}
```

---

## Namespaces multi-tenant:Um banco, mil inquilinos

Para ambientes SaaS onde um único banco PostgreSQL (ou Redis) atende múltiplos clientes, o Runiq oferece isolamento via prefixo de namespace.

Cada storage backend implementa a interface `Namespacer` com `SetNamespace`. O prefixo é prependido a todas as tabelas/chaves:

```go
type Namespacer interface {
	SetNamespace(ns string)
}
```

```go
func (p *PostgresStorage) SetNamespace(ns string) {
	if ns == "" {
		p.prefix = "runiq"
		return
	}
	p.prefix = "runiq_" + ns
}
```

O cliente expõe a opção `WithNamespace`:

```go
client := queue.NewClient(storage,
	queue.WithNamespace("tenant_acme_corp"),
)
```

Com isso, as tabelas do tenant `acme_corp` tornam-se `runiq_tenant_acme_corp_jobs`, `runiq_tenant_acme_corp_cron_jobs`, etc. Isso permite rodar centenas de inquilinos no mesmo cluster com isolamento total de dados.

---

## Eleição de líder distribuída

Tarefas como scheduler de crons, archiver de jobs antigos e purga de DLQ não podem ser executadas por todas as réplicas simultaneamente. O Runiq implementa **leader election** usando o próprio banco como coordenador:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithLeaderElection(15*time.Second),
)
```

### O mecanismo

A eleição usa uma linha de lease na tabela `runiq_leader_leases` com `ON CONFLICT DO UPDATE` condicional:

```go
func (p *PostgresStorage) AcquireLeader(ctx context.Context, clientID string, ttl time.Duration) (bool, error) {
	query := `
		INSERT INTO runiq_leader_leases (lease_key, holder_id, expires_at)
		VALUES ('leader', $1, $2)
		ON CONFLICT (lease_key) DO UPDATE
		SET holder_id = EXCLUDED.holder_id, expires_at = EXCLUDED.expires_at
		WHERE runiq_leader_leases.holder_id = $1
		   OR runiq_leader_leases.expires_at <= CURRENT_TIMESTAMP`
	expiresAt := time.Now().Add(ttl)
	res, err := p.db.ExecContext(ctx, p.q(query), clientID, expiresAt)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	return rows > 0, err
}
```

1. Cada réplica tenta renovar o lease a cada `ttl/2` segundos.
2. Se o lease expirou, qualquer réplica pode assumir a liderança.
3. Apenas o líder executa loops de background (crons, archival, purga).
4. Em caso de falha do líder, outra réplica assume na próxima janela de renew.

Isso garante alta disponibilidade sem depender de Consul, ZooKeeper ou etcd.

---

## Termos técnicos desmistificados

*   **AES-256-GCM:** Algoritmo de criptografia simétrica que combina o padrão AES com chave de 256 bits e o modo Galois/Counter, oferecendo confidencialidade e autenticação integradas.
*   **Multi-Tenant Namespace:** Prefixo lógico aplicado a todas as tabelas/chaves de armazenamento para isolar dados de diferentes inquilinos no mesmo banco físico.
*   **Leader Lease (Contrato de Liderança):** Registro temporário no banco que associa um identificador de processo a um cargo de liderança com prazo de validade, renovado periodicamente.
