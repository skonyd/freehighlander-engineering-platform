# FH-01B1 — Provisional V2 Compatibility

This package is a TypeScript compatibility port of the behavioral contracts captured from:

- repository: `skonyd/creator-marketplace`
- PR: `#207`
- provisional HEAD: `0e70f4a9680fcc5c287b7926f2aa20170c79f47d`

It deliberately keeps:

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

Implemented compatibility surfaces:

- task ID/fingerprint and fail-closed PR marker parsing
- risk/max-risk/final-review routing
- deterministic Opus routing
- test-review structural validation
- trusted provenance stamping contracts
- candidate decision exact-set/content-hash binding
- context-triage BASE_SHA/content-hash binding
- repair-round state semantics
- provisional authority guard

This is not the final accepted V2 authority implementation. FH-01B2 must reconcile this package against
the final accepted #207 reference SHA before any authority promotion.
