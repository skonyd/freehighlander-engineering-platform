# ADR-0010 — Local-first Identity, Remote Exposure ve Backup/Restore

**Status:** ACCEPTED

## Identity

### Initial local-first mode

İlk sürüm:
- single-user,
- local process,
- control plane varsayılan olarak loopback interface'e bind olur.

İlk aşamada full account system zorunlu değildir.

Human approval actor'ı yine stable bir local-owner identity ile kaydedilir.

### Remote exposure rule

Control plane loopback dışına bind edilecekse authentication zorunludur.

Self-hosted/multi-user aşamasında:
- OIDC/OAuth2-compatible identity provider
- secure server-side session
- workspace/project authorization
- stable subject ID

kullanılır.

High-impact human approvals ileride step-up authentication isteyebilir.

### Authorization

Authentication, authority değildir.

Authenticated user'ın:
- workspace role,
- project permission,
- approval scope

policy tarafından ayrıca doğrulanır.

## Backup / restore

### Backup set

Bir recovery point en az:
- SQLite consistent snapshot
- artifact manifest + required artifacts
- schema/migration version
- workflow/role/policy version refs
- repository/config refs
- snapshot manifest/hash

içerir.

Secrets varsayılan backup payload'ına plaintext olarak girmez; secret references/configuration instructions saklanabilir.

### SQLite rule

Canlı WAL-mode database dosyasını tek başına kopyalamak güvenli backup yöntemi sayılmaz.

Implementation:
- SQLite Online Backup API, veya
- VACUUM INTO uygun use case

ile consistent snapshot üretmelidir.

Raw filesystem copy yapılacaksa SQLite WAL/SHM semantics eksiksiz ele alınmalıdır; default yöntem değildir.

### Restore validation

Restore:
1. backup manifest/hash doğrular,
2. DB integrity/schema version doğrular,
3. artifact references kontrol eder,
4. migration compatibility kontrol eder,
5. application read-only smoke yapar,
6. ancak sonra normal run açar.

### Restore drills

Backup mekanizması yalnız "dosya üretildi" ile başarılı sayılmaz. Periyodik restore testleri gerekir.

RPO/RTO sayısal hedefleri gerçek kullanım başladıktan sonra belirlenir.

## Consequences

- local-first complexity düşük kalır
- accidental LAN exposure auth'sız kalmaz
- human approvals stable actor'a bağlanır
- SQLite backup/WAL hataları azaltılır
- restore test edilebilir bir feature olur
