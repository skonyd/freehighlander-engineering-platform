# ADR-0007 — Execution Sandbox, Data Privacy ve Retention Politikası

**Status:** ACCEPTED

## Context

FreeHighlander tool-enabled agent'lar çalıştıracak:
- repository read/write,
- shell/command execution,
- network access,
- provider API/CLI calls,
- future secrets access,
- runtime integrations.

Bu yetkiler hem source code hem credentials hem de kullanıcı/proje verisi için doğrudan güvenlik sınırı oluşturur.

Ayrıca model prompt/response, tool output, artifacts, logs ve telemetry uzun vadede hassas veri içerebilir. Bu nedenle sandbox, privacy ve retention orchestration contract'ın parçası olmalıdır.

## Decision

### 1. Default-deny execution model

Unknown permission = DENY.

Her role/job explicit capability ister:
- filesystem read
- filesystem write
- command execute
- network
- secrets
- browser/tool integrations

Workflow node veya prompt bu yetkileri kendi kendine genişletemez.

### 2. Workspace sandbox

İlk local-first sürümde execution scope varsayılan olarak aktif repository/worktree ile sınırlıdır.

Default:
- repository root dışına write yok
- user home üzerinde arbitrary scan yok
- sibling repository erişimi yok
- OS/system path write yok

Gerekirse explicit allowlist gerekir.

### 3. Command execution

Command policy katmanı:
- allow / deny / require-human
- cwd scope
- timeout
- env allowlist
- output size limits
- destructive-command classification

Destructive/high-impact işlemler için human gate gerekir.

Örnek high-impact:
- git push --force
- git reset --hard
- recursive delete
- credential/config mutation
- production deployment
- cloud/IAM mutation

### 4. Network access default-deny

Network erişimi role/sandbox policy ile açılır.

Policy en az:
- allowed hosts/domains
- allowed protocols
- read vs mutation intent
- provider/tool purpose

tanımlayabilmelidir.

Broad unrestricted outbound access varsayılan değildir.

### 5. Secrets separation

Secrets:
- prompt içine kalıcı plaintext olarak gömülmez
- artifact/log/state içine yazılmaz
- repo'ya commit edilmez

İlk kaynaklar:
- environment
- OS credential store

V3 hedef:
- secrets broker
- short-lived injection
- per-role/per-tool secret scope

Tool/model yalnız ihtiyaç duyduğu secret handle'ını alır.

### 6. Data classification

İlk sınıflar:

~~~text
PUBLIC
INTERNAL
CONFIDENTIAL
SECRET
~~~

Örnek:
- public docs → PUBLIC
- private source → INTERNAL/CONFIDENTIAL
- customer/project private data → CONFIDENTIAL
- credentials/tokens/keys → SECRET

### 7. Provider egress policy

Bir model/provider'a gönderilebilecek veri, role + data classification + provider policy ile belirlenir.

Örnek:
- SECRET → remote provider'a gönderme yok
- CONFIDENTIAL → yalnız explicit approved provider/binding
- INTERNAL → policy'ye göre remote/local
- PUBLIC → normal routing

Local model kullanımı privacy avantajı sağlar ama otomatik authority avantajı sağlamaz.

### 8. Redaction before persistence

Event/log/artifact persistence öncesi redaction hook uygulanmalıdır.

En az:
- API keys
- bearer tokens
- passwords
- common private-key blocks
- connection strings
- known secret env vars

Redaction failure high-risk path'te fail-closed olabilir.

### 9. Raw prompt/response retention

Default:
- full raw prompt/response indefinite tutulmaz
- authoritative artifact için gereken normalized output/evidence saklanır
- debug/raw capture opt-in ve sınırlı TTL ile yapılır

Amaç:
- auditability korumak
- gereksiz hassas veri ve storage büyümesini azaltmak

### 10. Retention classes

Önerilen sınıflar:

~~~text
EPHEMERAL
SHORT
PROJECT
AUDIT
~~~

Başlangıç anlamı:
- EPHEMERAL: transient tool/model debug data
- SHORT: troubleshooting için kısa TTL
- PROJECT: aktif proje boyunca gerekli artifacts
- AUDIT: decision/approval/provenance gibi uzun ömürlü kayıt

Kesin TTL değerleri deployment/usage verisiyle daha sonra policy'ye yazılabilir.

### 11. Deletion/export

Project data için gelecekte:
- export
- delete
- retention report
- orphan artifact cleanup

desteklenmelidir.

Silme işlemi audit trail'i bozmayacak şekilde tombstone/metadata bırakabilir; ancak SECRET/raw sensitive payload tutulmamalıdır.

### 12. Sandbox != trust in model

Güçlü model daha geniş tool permission anlamına gelmez.

Permissions logical role + workflow + policy + human approval üzerinden gelir.

## Consequences

- tool-enabled agents least-privilege çalışır
- privacy provider routing'in first-class girdisi olur
- logs/artifacts secrets açısından daha güvenli hale gelir
- future multi-user/self-hosted modele geçiş için temel oluşur
- retention/storage maliyeti kontrol edilebilir
