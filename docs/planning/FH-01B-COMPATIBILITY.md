# FH-01B — V2 Compatibility

**Status:** SPLIT INTO FH-01B1 + FH-01B2  
**Umbrella issue:** #16

## Why split

Creator Marketplace PR #207 is technically healthy so far, but final authority acceptance is incomplete because Sonnet candidate adjudication and Astra final review have not completed.

To avoid idle time without trusting an unfinished reference, FH-01B is split into two stages.

---

## FH-01B1 — Provisional V2 Compatibility Port

**Issue:** #18  
**Status: COMPLETE — PR #21**

Reference at planning time:

```text
repository: skonyd/creator-marketplace
PR: #207
provisional reference SHA:
0e70f4a9680fcc5c287b7926f2aa20170c79f47d
```

Required state:

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

FH-01B1 delivered the following provisional compatibility surfaces:

- compatibility layer for exact-SHA artifact binding
- fail-closed gate structure
- risk/denylist/human-required modeling
- context-triage compatibility
- candidate/adjudication compatibility
- Opus test-review semantics
- independent final-review interface
- trusted provenance compatibility
- repair-round semantics
- timeout/quota/fallback behavior
- golden/parity tests against the provisional reference

FH-01B1 must **not**:

- declare current #207 as the final accepted V2 reference
- enable FreeHighlander merge/final authority from this port
- silently reconcile future #207 changes
- turn provisional artifacts into accepted reference evidence

---

## FH-01B2 — Accepted V2 Reconciliation + Authority Promotion

**Issue:** #19  
**Blocked until #207 final acceptance + merge + smoke**

Required #207 sequence:

1. Sonnet candidate adjudication
2. Astra final review
3. HUMAN REQUIRED / human decision
4. merge
5. post-merge smoke

Then FH-01B2 must:

1. record the final accepted V2 reference SHA
2. compare provisional reference SHA vs final accepted SHA
3. if unchanged, prove parity and reuse FH-01B1 implementation
4. if changed, inspect the exact delta and port only required fixes
5. rerun golden/parity/regression suites
6. verify authority/provenance/fail-closed invariants
7. explicitly review the promotion decision
8. only then change reference status from PROVISIONAL to ACCEPTED
9. only then enable authority allowed by policy

## Mandatory final confirmation

FH-01B may not be declared complete until all are explicitly checked:

```text
[ ] provisional_reference_sha recorded
[ ] final_accepted_reference_sha recorded
[ ] delta_reviewed
[ ] parity_suite_passed
[ ] post_port_smoke_passed
[ ] authority_promotion_reviewed
```

This confirmation is a hard handoff checkpoint, not an informal note.
