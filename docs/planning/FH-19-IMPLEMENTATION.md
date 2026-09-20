# FH-19 — V2/V3 shadow dual-run parity

**Issue:** #58  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Produce deterministic parity evidence between provisional V2 compatibility behavior and V3 shadow behavior without granting V3 authority or enabling cutover.

## Dimensions

- route
- gate
- artifact
- state
- failure
- outcome

## Exact binding

Every parity case binds:
- repository + exact head SHA;
- workflow hash;
- policy hash;
- artifact-root hash;
- authoritative input hash;
- exact V2 reference repository/SHA/status.

## Statuses

- PASS
- MISMATCH
- INSUFFICIENT_EVIDENCE
- EXCLUDED
- UNAVAILABLE

## Invariants

```text
parity PASS != authority
parity PASS != cutover
missing evidence != parity
V2 reference status remains visible
V3 authority remains SHADOW_ONLY
```

## Verification

```bash
npm run verify
```
