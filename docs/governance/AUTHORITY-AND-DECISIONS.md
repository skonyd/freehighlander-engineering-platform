# Authority & Decision Model

**Status:** DRAFT

```text
Workflow Layer
      ↓
Policy Layer
      ↓
Authority Layer
```

Workflow değişebilir; policy/authority invariant'ları yanlış config ile kaldırılamaz.

## Authority örnekleri
advisory, candidate producer, code writer, adjudicator, final reviewer, human approver.

## Invariant'lar
- producer != final approver
- model trusted provenance metadata'sını belirleyemez
- unknown gate = FAIL
- revision mismatch = STALE/FAIL
- fallback semantic negative verdict'i bypass edemez
- critical policy human approval isteyebilir
- independent reviewer gerektiğinde aynı independence group kullanılmaz

## Decision lifecycle
PROPOSED → ACCEPTED/REJECTED → SUPERSEDED.
