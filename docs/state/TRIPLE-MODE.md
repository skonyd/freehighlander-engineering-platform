# 3'lü Mod — Cross-model Working Contract

**Status:** ACCEPTED WORKING MODE

"3'lü mod" model namesından çok üç ayrı sorumluluk alanını ifade eder. Preferred bindings bugün aşağıdaki gibidir; V3'te binding'ler değişebilir.

## Role A — Discovery / Refine / Independent Final Diff Review

**Preferred current binding:** Claude

Responsibilities:
- requirement/discovery refinement,
- ambiguity and architecture reasoning,
- cross-file impact analysis,
- after implementation: clean-context independent diff review.

Must not:
- silently approve its own implementation as independent final review,
- lower risk to make a gate pass.

## Role B — Plan Challenge / Implementation / Verified Fix

**Preferred current binding:** Codex

Responsibilities:
- challenge/refine implementation plan,
- implement bounded changes,
- run deterministic verification,
- fix findings that have been accepted/adjudicated.

Rule:
- two primary writers do not edit the same ticket concurrently without explicit task partitioning.

## Role C — Local High-volume Worker

**Preferred current binding:** Qwen3.8-Flash-Next / local worker

Responsibilities:
- repository scanning,
- bulk/mechanical transformations,
- summarization/classification,
- candidate generation,
- evidence collection,
- other cheap/verifiable work.

Authority:
- advisory/candidate by default.
- it does not self-adjudicate findings.
- it is not final merge authority.

## Canonical 3'lü flow

```text
Discovery / refine
      ↓
Plan challenge
      ↓
Implementation
      ↓
Deterministic verification
      ↓
Independent clean-context review
      ↓
Verified fixes if needed
      ↓
Policy / final review / human boundary
```

Local worker can support multiple stages, but its output remains data/evidence unless policy explicitly grants a stronger logical role.

## Model-independent continuation

If a fresh model is not Claude, Codex or Qwen:
1. it reads repository state,
2. determines the active **logical role**,
3. performs only work allowed by that role,
4. preserves independence boundaries.

It may act as coordinator/analyst, but it must not pretend to be an independent reviewer if doing so would violate the role separation required by the active workflow.

## Quota interruption

Quota/provider failure is a resumable state:
- record blocker,
- preserve artifacts/state,
- do not fabricate missing reviewer output,
- resume from the same gate when provider/binding becomes available.
