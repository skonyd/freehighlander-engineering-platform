# FH-17 — Deterministic replay, simulation and crash recovery

**Issue:** #54  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Replay recorded workflow outcomes and resume after interruption only when exact workflow, revision, policy, snapshot and artifact identity still match.

## Scope

- deterministic replay manifest
- exact revision/workflow/run-snapshot/policy/artifact-root binding
- contiguous recorded node outcomes
- explicit input-hash divergence detection
- durable recovery checkpoint hash
- checkpoint-to-manifest binding
- deterministic next replay sequence
- stale/tampered checkpoint fail-closed behavior
- simulation/replay authority guard

## Invariants

```text
replay != authority
simulation != authority
divergence != hidden
checkpoint mismatch => reject
revision/workflow/policy/artifact mismatch => reject
```

V3 remains SHADOW_ONLY until FH-20.

## Verification

```bash
npm run verify
```
