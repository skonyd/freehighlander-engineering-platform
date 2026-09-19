# PR Roadmap

**Status:** ACCEPTED DIRECTION

FH kimlikleri planlanan çalışma paketidir; gerçek GitHub PR numarası değildir.

## Foundation / automation
- **FH-00** Planning foundation
- **FH-01** TypeScript monorepo + automation bootstrap
- **FH-02** Telemetry event schema + emitter
- **FH-03** SQLite telemetry/state index
- **FH-04** Read-only dashboard

## Qwen / economics
- **FH-05** Qwen specialist shadow roles
- **FH-06** Benchmark reconciliation + promotion reports
- **FH-07** Token/context optimization
- **FH-08** Provider health/quota/circuit-breaker telemetry

## V3
- **FH-10** Architecture contract freeze
- **FH-11** Provider adapters + binding registry
- **FH-12** Role registry + role packages
- **FH-13** Workflow DAG + explicit state machine
- **FH-14** Debate/council + disagreement escalation
- **FH-15** Policy-as-code + human approval
- **FH-16** Artifact lineage + hashes
- **FH-17** Replay/simulation + crash recovery
- **FH-18** Management UI
- **FH-19** V2/V3 shadow parity
- **FH-20** V3 authority cutover

## Modules
- **FH-30** Planning module MVP
- **FH-31** Development module
- **FH-32** Testing module
- **FH-33** Security module
- **FH-34** Release module
- **FH-35** Operations module
- **FH-36** Incident module
- **FH-37** Project knowledge graph / engineering lineage

## PR intent details

### FH-01 — TypeScript monorepo + automation bootstrap
Creator Marketplace #207 merge+smoke sonrası başlar.

Amaç:
- bu repo ürün kodunu taşımaya başlasın
- V2 automation bu repo üzerinde çalışsın
- V3 için yeni codebase foundation oluşsun

Önerilen başlangıç:
```text
apps/
  web/
  control-plane/

packages/
  core/
  workflow/
  roles/
  providers/
  policy/
  artifacts/
  telemetry/
  persistence/
  ui-components/
```

Bu layout FH-01 başlamadan son kez teknik olarak doğrulanacaktır.

### FH-02
Mevcut automation'a davranış değiştirmeden telemetry instrumentation.

### FH-03
SQLite current-state/query/metadata + JSONL import/audit.

### FH-04
Read-only dashboard; authority/config write yok.

### FH-05/FH-06
Qwen shadow role benchmark. Strong reviewer ilk verdict'i Qwen'den bağımsız üretir.

### FH-07
Benchmark sonucu güvenli bulunan iş yüklerinde context/token optimization.

### FH-10+
V3 role/model/workflow control plane.

## Dependency spine
```text
#207 merge+smoke
      ↓
FH-00
      ↓
FH-01 → FH-02 → FH-03 → FH-04
                   ↓
                FH-05 → FH-06 → FH-07/08
                                 ↓
                              FH-10
                                 ↓
                    FH-11 → FH-12 → FH-13
                                      ↓
                              FH-14/15/16
                                      ↓
                                  FH-17/18
                                      ↓
                                  FH-19 → FH-20
                                              ↓
                                         FH-30+
```
