# FH-07 — Token/context optimization implementation

**Issue:** #11  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Reduce repeated/irrelevant model input while preserving every authority, evidence, exact-revision and independent-review invariant.

FH-07 is an optimization layer. It may explain, budget, cache or reuse semantically identical work; it must never make a gate PASS, weaken required evidence, change risk, promote a model/role, or replace human/policy authority.

## Delivery slices

### FH-07A — deterministic context packet + semantic identity — IMPLEMENTED

- deterministic context packet manifest
- per-item SHA-256 content hash
- packet hash / packet ID
- explicit `requiredByGate` and `stale` flags
- stale-context trimming that can never remove gate-required items
- prompt/contract fingerprint
- semantic model-call reuse key

Acceptance:
- identical semantic input produces the same hashes
- relevant input/revision/contract/binding changes invalidate reuse
- duplicate context IDs fail closed
- required gate evidence survives stale trimming

### FH-07B — token budget preflight — IMPLEMENTED

- load/represent target + warning limits
- use provider `countInputTokens()` when available
- deterministic fallback state when exact counting is unavailable
- WARN / EXHAUSTED diagnostics only; no evidence truncation
- estimated-vs-actual token metadata

### FH-07C — cache/reuse diagnostics telemetry — FOUNDATION IMPLEMENTED

- cache key/prefix version metadata
- cache hit / artifact reuse diagnostic events
- cached input + cache-write usage
- repeat-call waste diagnostics
- no prompt/completion body logging by default

### FH-07D — stable prompt prefix contract — IMPLEMENTED

- stable-prefix versioning
- dynamic evidence after the stable prefix
- provider-neutral cache hints
- no assumption that a cache hit occurred\n- executable token-policy/context-profile loader and doctor validation

### FH-07E — integration / verification

- wire packet + budget + telemetry into bounded model execution paths
- deterministic unit/contract tests
- architecture guards for authority neutrality
- `npm run verify`
- update canonical state/docs
- PR review; no direct main write

## Non-negotiable invariants

1. Required final-review/full-diff evidence is not trimmed to meet a token budget.
2. Cache/reuse is an optimization, never correctness evidence.
3. Reuse requires exact semantic identity including revision, workflow, role contract, policy, binding/model/effort and relevant input.
4. Fallback remains availability-only; semantic FAIL/BLOCKED/INSUFFICIENT is not model-shopped.
5. FH-01B2 remains blocked until Creator Marketplace #207 is accepted, merged and smoke-tested.
6. No automatic role/model promotion is introduced.

## Rollout / rollback

FH-07 is additive. New packet/budget/reuse contracts remain opt-in until the integration slice. Rollback is removal/disablement of the optimization path; authoritative evidence and existing execution remain unchanged.

## Verification

Canonical:

```bash
npm run verify
```
