# ADR-0006 — Workflow Persistence, Versioning ve Debate/Council Semantics

**Status:** ACCEPTED

## Context

FreeHighlander workflow'ları zamanla UI üzerinden oluşturulacak, versionlanacak ve farklı provider/model binding'leri ile çalıştırılacak.

Workflow authoring kolay olmalı; ancak aktif run'ın ortasında source/config değişmesi sonucu davranışın belirsizleşmesi kabul edilemez.

Debate/council özelliği de tek bir model verdict'ini tekrar ettiren sohbet değil; bağımsız ilk görüş + bounded reconciliation protokolü olmalıdır.

## Decision

### 1. Workflow tanımı repo-as-code başlar

İlk kanonik format YAML/JSON tabanlı versioned workflow spec olacaktır.

Avantaj:
- Git history
- code review
- diff
- rollback
- offline/local çalışma
- reproducibility

### 2. UI source formatı değiştirmez, publish eder

V3 UI:

~~~text
Draft
  ↓
Validate
  ↓
Simulate
  ↓
Publish
~~~

akışıyla immutable workflow version üretir.

UI/DB'deki draft state, published workflow authority değildir.

### 3. Run başlangıcında workflow snapshot pinlenir

Her run:
- workflow id
- workflow version
- workflow hash
- role package versions
- policy hash
- binding plan

ile başlar.

Aktif run ortasında published workflow değişse bile mevcut run eski snapshot ile devam eder.

### 4. Workflow primitive seti

İlk hedef primitive'ler:

~~~text
MODEL
COMMAND
GATE
CONDITION
PARALLEL
AGGREGATE
DEBATE
LOOP
HUMAN
SUBWORKFLOW
~~~

LOOP mutlaka bounded olmalıdır.

### 5. Debate bağımsız ilk görüş ile başlar

Debate protokolü:

~~~text
Round 0
  participant A independent opinion
  participant B independent opinion
  participant C independent opinion
        ↓
reveal
        ↓
disagreement analysis
        ↓
bounded cross-review
        ↓
reconciliation / escalation
~~~

Katılımcılar Round 0'da birbirlerinin verdict'ini görmez.

### 6. Consensus authority değildir

Desteklenecek consensus stratejileri:

- unanimous
- majority
- weighted
- adjudicator

Ancak consensus sonucu:
- SYSTEM_POLICY'yi,
- HUMAN_REQUIRED kararını,
- exact-evidence requirement'ı

override edemez.

### 7. Tie/disagreement escalation

Policy'ye göre:
- additional bounded round
- dedicated adjudicator role
- human escalation

kullanılır.

Sonsuz debate yoktur.

### 8. Debate budget

Her DEBATE node:
- max rounds
- max participants
- time budget
- token/cost budget

taşır.

Budget aşımı semantic PASS sayılmaz; policy-defined escalation olur.

### 9. Independence group

Debate participant'ları gerektiğinde farklı independence group'lardan seçilir.

Aynı modelin üç alias'ı üç bağımsız reviewer sayılmaz.

### 10. Debate artifact

Her round ayrı evidence artifact üretir:
- participant
- binding
- hidden initial opinion
- revealed inputs
- response
- evidence refs
- disagreements
- round result

Final council summary ham görüşlerin yerini almaz.

## Consequences

- workflow UI ve Git aynı versioned contract üzerinde birleşir
- aktif run deterministik/reproducible kalır
- debate anchoring riski azalır
- consensus model authority haline gelmez
- maliyet/round kontrol altındadır
