# Qwen / Local Model Role Benchmark ve Promotion Policy

## Goal

Kaliteyi anlamlı düşürmeden hangi high-volume rollerin local/Qwen binding'e devredilebildiğini gerçek workload ile ölçmek.

## Independent shadow design

~~~text
same authoritative input packet
        ├── candidate local model
        └── reference reviewer
                 ↓
          hidden first verdicts
                 ↓
          reconciliation label
~~~

Candidate model reference verdict'i ilk opinion öncesi görmez.

## Per-role metrics

Quality:
- adjudicated sample count
- agreement
- precision / confirmed finding rate
- false-positive rate
- P0/P1 miss
- P2 miss
- malformed/schema-invalid output
- evidence quality

Efficiency:
- input/cached/output/reasoning tokens
- latency p50/p95
- retry/timeout/provider failure
- paid-token/cost saving
- artifact reuse/cache hit

## Provisional promotion-candidate floors

### NORMAL
- >= 50 adjudicated real samples
- agreement >= 95%
- P0/P1 miss = 0
- meaningful efficiency benefit

### HIGH
- >= 100 adjudicated real samples
- agreement >= 97%
- P0/P1 miss = 0
- regression/adversarial suite PASS

These are screening floors, not statistical safety guarantees.

### CRITICAL / authority
No promotion solely for economics. Human/policy + regression + independence validation required.

## Serious misses

P0/P1 or systematic P2 misses should become regression cases where safe.

A model/version upgrade reruns relevant regression corpus before promotion.

## Lifecycle

~~~text
SHADOW
 → BENCHMARKED
 → PROMOTION_CANDIDATE
 → HUMAN/POLICY DECISION
 → PRIMARY/ESCALATION POLICY
~~~

System never self-promotes authority from benchmark score alone.
