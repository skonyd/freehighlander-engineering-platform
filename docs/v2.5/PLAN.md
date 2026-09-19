# V2.5 Planı — V3 Öncesi Ölçüm ve Optimizasyon

## Amaç

Mevcut shell tabanlı sistemin davranışını değiştirmeden ölçmek; ardından kaliteyi koruyarak pahalı model iş yükünü Qwen/local modellere devretmek.

## Sıra

1. Telemetry/event schema.
2. Token/latency/failure accounting.
3. Read-only dashboard.
4. Qwen specialist rollerini shadow mode.
5. Independent strong-reviewer comparison.
6. Benchmark dataset.
7. Promotion kararları.
8. Token/context optimization.
9. V3 tasarım girdileri.

## Devir prensibi

```text
LOCAL/CHEAP MODEL
search / triage / generate / implement / candidate / evidence
        ↓
DETERMINISTIC EVIDENCE
        ↓
STRONG INDEPENDENT REVIEWER
adjudicate / challenge / final-review
        ↓
POLICY / HUMAN
actual authority
```

## İlk Qwen-primary roller

- context-triage
- repo-analysis
- deep-analysis
- failure-analysis
- pre-review
- evidence-collector
- bounded-implement
- documentation-consistency

## Shadow roller

- test-candidate-reviewer
- security-candidate-reviewer
- architecture-consistency-reviewer
- cve-dependency-triage

## Şimdilik devredilmeyecek authority roller

- candidate adjudication
- context-triage adjudication
- risk downgrade authority
- final reviewer
- merge authority
- human approval

Opus test sufficiency de ilk aşamada authority olarak korunur; Qwen paralel shadow benchmark üretir.
