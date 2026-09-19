# Qwen Role Benchmark ve Promotion Politikası

## Amaç

Hangi rollerin kaliteyi anlamlı düşürmeden local/Qwen'e devredilebildiğini gerçek proje verisiyle ölçmek.

## Benchmark tasarımı

İlk görüşler bağımsız üretilir:

```text
            SAME INPUT
        ┌──────┴──────┐
        ↓             ↓
      Qwen        Strong reviewer
        │             │
        └──────┬──────┘
               ↓
          reconciliation
               ↓
          benchmark label
```

Strong reviewer Qwen sonucunu ilk verdict öncesinde görmemelidir; anchoring azaltılır.

## Rol başına metrikler

- sample count
- agreement rate
- confirmed finding rate / precision
- false-positive rate
- P0/P1 miss count
- P2 miss count
- latency avg/p50/p95
- input/output tokens
- retry rate
- timeout rate
- quota impact
- paid-model token saving

## Başlangıç promotion eşiği

### NORMAL

- yaklaşık 50+ gerçek karar
- agreement ≥ %95
- P0/P1 miss = 0
- false-positive kabul edilebilir
- anlamlı token/cost avantajı

### HIGH

- yaklaşık 100+ gerçek karar
- agreement ≥ %97
- P0/P1 miss = 0
- tekrarlanan P2 miss çok düşük

### CRITICAL / authority

Ekonomik gerekçeyle otomatik promotion yapılmaz. Bağımsızlık ve insan otoritesi korunur.

## Promotion akışı

```text
SHADOW
  ↓
BENCHMARKED
  ↓
PROMOTION CANDIDATE
  ↓
HUMAN APPROVAL
  ↓
PRIMARY / ESCALATION POLICY
```

Sistem kendi kendine authority değiştirmez.
