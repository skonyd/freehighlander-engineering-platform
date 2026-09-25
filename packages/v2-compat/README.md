# FH-01B2 — Accepted V2 Compatibility

This package is the reconciled TypeScript compatibility port of the accepted Creator Marketplace
automation behavior.

Canonical reference chain:

- repository: `skonyd/creator-marketplace`
- PR: `#207`
- provisional FH-01B1 SHA: `0e70f4a9680fcc5c287b7926f2aa20170c79f47d`
- #207 merge SHA: `e4707a3c4267db9d2aadd452782b91045b96724d`
- direct post-merge hardening: PR `#209`
- final accepted reference SHA: `1a8e215b78a3a5008aae6aae36488b3273733b19`

Current compatibility state:

```text
REFERENCE_STATUS          = ACCEPTED
V2_COMPATIBILITY_AUTHORITY = ENABLED
V3_AUTHORITY              = SHADOW_ONLY
```

Reconciled compatibility surfaces include:

- task ID/fingerprint and fail-closed PR marker parsing
- risk/max-risk/final-review routing
- final independent reviewer `gpt-6-sol / medium` for every risk tier
- test adequacy reviewer `claude-opus-5-5 / low`
- full verification command set including the complete automation regression suite
- worker timeout, aggregate-budget and generation/sampling reference values
- strict protocol STATUS/ROLE uniqueness
- context-triage BASE_SHA/content-hash binding and status-independent signal adjudication
- trusted provenance stamping contracts
- candidate exact-set/content-hash binding
- canonical test-review and final-review scope hashes
- repair-round state semantics
- availability-only fallback classification
- full-artifact authority invariant

This promotion applies only to the accepted V2 compatibility contract. It does not activate V3
merge/release/deploy authority, retire legacy behavior, or bypass CRITICAL, denylist,
HUMAN_REQUIRED, exact-revision, provenance or semantic-failure gates. FH-20 remains the V3
authority cutover path.
