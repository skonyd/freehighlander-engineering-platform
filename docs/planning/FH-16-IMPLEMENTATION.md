# FH-16 — Artifact lineage and hash-bound provenance

**Issue:** #52  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Make every reusable/authoritative artifact traceable to deterministic content and semantic inputs without allowing lineage metadata to change authority.

## Delivered scope

- canonical artifact envelope
- SHA-256 content hash
- artifact identity hash independent of display-only artifact ID
- exact revision/workflow/role-contract/policy/producer/binding identity
- ordered parent artifact hashes
- duplicate-parent rejection
- missing-parent fail-closed verification
- cycle fail-closed verification
- deterministic ancestry traversal
- currentness checks against revision/workflow/role/policy
- content tamper verification
- authority-neutral architecture guard

## Invariants

```text
lineage != authority
artifact_id != content identity
reuse != bypass current binding validation
missing/cyclic lineage => invalid
```

V3 remains SHADOW_ONLY until FH-20. FH-01B2 remains blocked by Creator Marketplace #207.

## Verification

```bash
npm run verify
```
