# ADR-0010 — Local-first Identity, Remote Auth, Backup ve Recovery

**Status:** ACCEPTED

## Local-first identity

İlk single-user local mode:
- loopback/local process trust boundary
- ayrı login zorunlu değil
- UI/control-plane remote interface varsayılan olarak expose edilmez

"Local mode" gelecekte remote/self-hosted mode için auth bypass anlamına gelmez.

## Remote/self-hosted auth

Remote erişim açıldığında:
- OIDC/OAuth tabanlı auth
- Authorization Code + PKCE
- exact redirect URI validation
- secure token storage
- short-lived access tokens
- rotated/sender-constrained refresh token yaklaşımı
- explicit scopes

tercih edilir.

WebAuthn/passkeys güçlü user authentication seçeneği olarak desteklenebilir.

## MCP / external authorization

Remote HTTP MCP/tool integrations için protocol-standard authorization izlenir.

Güvenlik kuralları:
- token audience/resource binding
- token passthrough yok
- PKCE
- HTTPS
- exact redirect URIs
- separate upstream token when proxying

Local STDIO-style integrations secrets'i environment/credential broker üzerinden alır; repo state'ten değil.

## Backup scope

Backup birlikte ele alınır:

~~~text
SQLite state/index
artifact content
published workflow/role/policy specs
critical configuration
audit metadata
~~~

Git repository zaten source-controlled specs/code için bir recovery layer'dır; runtime state/artifacts ayrıca yedeklenir.

## SQLite backup

Live SQLite DB için raw file copy varsayılmaz.

Tercih:
- SQLite Online Backup API / library-supported equivalent
- veya controlled VACUUM INTO snapshot

WAL mode kullanılıyorsa `-wal` state'i dikkate alınır; açık DB'nin sadece ana dosyasını kopyalamak güvenli backup kontratı değildir.

## Backup manifest

Her backup:
- schema version
- DB snapshot hash
- artifact inventory/hash
- timestamp
- app version
- migration version

taşır.

## Restore

Restore acceptance:
1. backup manifest validate
2. DB integrity/migration compatibility
3. artifact hash/reference validation
4. critical state reconciliation
5. read-only smoke/replay
6. only then normal operation

## Recovery targets

İlk local ürün için formal enterprise RPO/RTO zorunlu değildir; ancak:
- manual on-demand backup
- pre-migration backup
- automatic periodic backup
- restore verification

desteklenmelidir.

## Consequences

Local-first kullanım basit kalır; remote mode güvenliği sonradan yapıştırılmış bir bypass'a dönüşmez.
