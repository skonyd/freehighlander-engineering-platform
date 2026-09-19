# ADR-0010 — Local-first Identity, Remote Auth, Backup ve Recovery

**Status:** ACCEPTED

## Local-first identity

İlk single-user local mode:
- loopback/local process trust boundary
- ayrı full account system zorunlu değil
- UI/control-plane remote interface varsayılan olarak expose edilmez
- human approval actor'ı stable `local-owner` identity ile kaydedilir

"Local mode" remote/self-hosted mode için auth bypass değildir.

## Remote/self-hosted auth

Control plane loopback dışına bind edilecekse authentication zorunludur.

Self-hosted/multi-user aşamasında:
- OIDC/OAuth2-compatible identity provider
- Authorization Code + PKCE
- exact redirect URI validation
- secure server-side/session token handling
- stable subject ID
- workspace/project authorization

kullanılır.

High-impact human approvals step-up authentication isteyebilir.

Authentication authority değildir; authenticated actor'ın project/approval scope'u policy tarafından ayrıca doğrulanır.

## External/MCP authorization

Remote HTTP tool/MCP integrations protocol-standard authorization kullanır.

Kurallar:
- audience/resource-bound tokens
- token passthrough yok
- PKCE where applicable
- HTTPS
- scoped/short-lived credentials
- proxy/upstream token separation

Local STDIO-style integrations credentials'i environment/credential broker üzerinden alır; repo state'ten değil.

## Backup scope

Bir recovery point birlikte ele alır:

~~~text
SQLite state/index
artifact content
published workflow/role/policy specs
critical configuration references
audit metadata
repository/config refs
~~~

Secrets backup payload'ına plaintext olarak girmez.

## SQLite backup

Live DB için raw file copy varsayılmaz.

Tercih:
- SQLite Online Backup API / library-supported equivalent
- veya uygun use case'te VACUUM INTO

WAL mode'da açık DB'nin yalnız ana dosyasını kopyalamak güvenli backup kontratı değildir.

## Backup manifest

Her backup en az:
- schema/migration version
- DB snapshot hash
- artifact inventory/hash
- timestamp
- app version
- workflow/role/policy refs
- repository revision

taşır.

## Restore validation

1. manifest/hash validate
2. DB integrity/schema compatibility
3. artifact refs/checksums
4. migration compatibility
5. critical state reconciliation
6. read-only app smoke/replay
7. then normal operation

Backup "dosya üretildi" ile tamam sayılmaz; restore drill gerekir.

## Recovery targets

İlk local ürün için formal enterprise RPO/RTO sayısı zorunlu değildir.

Başlangıç:
- on-demand backup
- pre-migration backup
- automatic periodic backup
- restore verification

RPO/RTO gerçek kullanım başladıktan sonra ölçülür ve versioned policy olur.
