# ADR-0005 — Logical Role Authority Model ve Role Package Formatı

**Status:** ACCEPTED

## Context

FreeHighlander'da model, prompt ve authority birbirinden ayrılmalıdır.

Bir model güçlü olduğu için kendiliğinden daha fazla yetki kazanmamalı; bir prompt içine "sen final approver'sın" yazmak da gerçek authority oluşturmamalıdır.

Bu nedenle role şu dört kavramdan ayrılır:

- model
- provider
- prompt
- workflow node

## Decision

### 1. Authority logical role'a aittir

Authority katmanları:

~~~text
ADVISORY
CANDIDATE
WRITER
ADJUDICATOR
FINAL_REVIEWER
HUMAN_APPROVER
SYSTEM_POLICY
~~~

Bir role birden fazla capability verilebilir ancak policy, risk tier ve workflow context izin vermedikçe üst authority'ye geçemez.

### 2. Human ve policy ayrı authority sınıfıdır

Model rolleri HUMAN_APPROVER veya SYSTEM_POLICY authority'sini taklit edemez.

- HUMAN_APPROVER gerçek kullanıcı/authorized human decision'ıdır.
- SYSTEM_POLICY deterministic/policy-as-code karar katmanıdır.

### 3. Role package prompt'tan büyüktür

Bir role package en az şunları içerir:

- id
- version
- purpose
- authority
- allowed actions
- forbidden actions
- input contract
- output schema
- evidence requirements
- tool permissions
- data-access scope
- allowed risk tiers
- independence requirements
- preferred bindings / fallback policy
- prompt contract reference
- evaluation policy
- timeout / retry policy
- sandbox policy reference

### 4. Role package declarative olmalıdır

İlk format YAML.

Neden:
- human-readable,
- git-diff friendly,
- schema ile doğrulanabilir,
- UI tarafından üretilebilir,
- TypeScript core'dan bağımsız taşınabilir.

### 5. Prompt ayrı artifact/contract olur

Role package prompt body'yi doğrudan taşımak zorunda değildir.

Önerilen bağ:

~~~text
role.yaml
  ↓
prompt_contract: prompts/test-reviewer@3
~~~

Prompt güncellemesi role semantic version/hash zincirine dahil edilir.

### 6. Authority escalation role manifest ile yapılamaz

Bir role package kendi kendine:
- CRITICAL merge,
- final approval,
- human bypass,
- risk downgrade

yetkisi veremez.

Policy engine role manifest'i üst sınır olarak doğrular.

### 7. Independence first-class olmalıdır

Role şu kuralları tanımlayabilir:

~~~text
independence:
  cannot_review_own_output: true
  must_differ_from_roles:
    - implementer
  independence_group_required: true
~~~

Binding fallback bu şartı bozamaz.

### 8. Tool/data access least-privilege olmalıdır

Role package:
- read
- search
- edit
- execute
- network
- secrets
- provider tools

gibi hakları explicit tanımlar.

Unknown tool permission = DENY.

### 9. Output schema authoritative validator dışındadır

Model'in schema'ya uygun çıktı üretmesi gerekir; ancak schema valid olması semantic doğruluk anlamına gelmez.

Validation sırası:

~~~text
schema
  ↓
provenance
  ↓
evidence
  ↓
policy/authority
  ↓
semantic adjudication where required
~~~

### 10. Role version pinning

Bir workflow run başladığında role version'ları immutable şekilde pinlenir.

Aktif run ortasında role package değişikliği uygulanmaz.

## Consequences

- model değişebilir, role semantics değişmez
- UI gelecekte role oluşturabilir/versionlayabilir
- role marketplace/library mümkün olur
- prompt/model değişikliği audit edilebilir
- least-privilege tool access uygulanabilir
- reviewer independence config seviyesinde ifade edilebilir
