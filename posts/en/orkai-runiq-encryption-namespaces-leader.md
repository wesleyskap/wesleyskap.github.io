---
title: "Encryption, multi-tenant isolation, and leader election:Security and HA in runiq"
excerpt: "How to protect sensitive data at rest, isolate hundreds of tenants in the same cluster, and ensure only one worker leads critical tasks — all without external infrastructure."
category: "Security"
date: "July 5, 2026"
readTime: "7 min read"
author: "Wesley Lima"
series: "orkai-runiq-series"
seriesIndex: 7
referenceLink: "https://github.com/wesleyskap/orkai-runiq"
---
## Three challenges, one codebase

Background job processors in production face three classic problems that are rarely solved together:

1. **Data leakage:** Job payloads may contain PII, tokens, or API keys stored as plain text in the database.
2. **Tenant isolation:** A shared cluster needs to segregate different customers' data without multiplying databases.
3. **Single points of failure:** Maintenance tasks (crons, archival) running on multiple replicas cause duplication.

Orkai Runiq solves all three with native, infrastructure-independent solutions.

---

## AES-256-GCM encryption at rest

Runiq encrypts payloads on the client side before enqueuing and transparently decrypts them on the worker, with zero schema changes.

The system uses **AES-256-GCM** with a random 12-byte nonce from `crypto/rand`. The ciphertext is prefixed with a magic header `runiq:enc:` for automatic identification:

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

### Client and worker activation

```go
// Client encrypts before enqueuing
client := queue.NewClient(storage,
	queue.WithClientPayloadEncryption(encryptionKey),
)

// Worker decrypts before executing
pool := queue.NewWorkerPool(storage, 10,
	queue.WithWorkerPayloadEncryption(encryptionKey),
)
```

The check is automatic: at execution time, the worker verifies the `runiq:enc:` header and decides whether to decrypt:

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
	// proceeds with normal execution...
}
```

---

## Multi-tenant namespaces:One database, thousand tenants

For SaaS environments where a single PostgreSQL (or Redis) database serves multiple clients, Runiq offers isolation via namespace prefixing.

Each storage backend implements the `Namespacer` interface with `SetNamespace`. The prefix is prepended to all tables/keys:

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

The client exposes the `WithNamespace` option:

```go
client := queue.NewClient(storage,
	queue.WithNamespace("tenant_acme_corp"),
)
```

The tenant `acme_corp` tables become `runiq_tenant_acme_corp_jobs`, `runiq_tenant_acme_corp_cron_jobs`, etc. This allows running hundreds of tenants in the same cluster with full data isolation.

---

## Distributed leader election

Tasks like cron scheduling, job archival, and DLQ purging cannot run on all replicas simultaneously. Runiq implements **leader election** using the database itself as coordinator:

```go
pool := queue.NewWorkerPool(storage, 10,
	queue.WithLeaderElection(15*time.Second),
)
```

### The mechanism

The election uses a lease row in the `runiq_leader_leases` table with conditional `ON CONFLICT DO UPDATE`:

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

1. Each replica tries to renew the lease every `ttl/2` seconds.
2. If the lease expired, any replica can assume leadership.
3. Only the leader runs background loops (crons, archival, purges).
4. If the leader fails, another replica takes over at the next renew window.

This guarantees high availability without depending on Consul, ZooKeeper, or etcd.

---

## Technical terms demystified

*   **AES-256-GCM:** A symmetric encryption algorithm combining AES with a 256-bit key and Galois/Counter mode, providing both confidentiality and authentication.
*   **Multi-Tenant Namespace:** A logical prefix applied to all storage tables/keys to isolate different tenants' data within the same physical database.
*   **Leader Lease:** A temporary database record associating a process identifier with a leadership role and an expiration timestamp, periodically renewed.
