# ADR-0021 — Accept the final V2 automation reference after Creator Marketplace #207

**Status:** ACCEPTED

## Context

FH-01B1 captured a provisional compatibility baseline from Creator Marketplace PR #207 at
`0e70f4a9680fcc5c287b7926f2aa20170c79f47d` while the source pipeline was still under
candidate adjudication and independent review. FreeHighlander therefore kept the reference
`PROVISIONAL` and compatibility authority `DISABLED`.

Creator Marketplace #207 was merged as
`e4707a3c4267db9d2aadd452782b91045b96724d`. Its direct post-merge hardening PR #209 then
closed the remaining final P2, expanded full verification to the complete automation regression
suite, and changed the canonical independent reviewers. The resulting accepted source-main
reference is:

`1a8e215b78a3a5008aae6aae36488b3273733b19`

## Decision

Promote the FH-01B compatibility reference to:

```text
REFERENCE_STATUS = ACCEPTED
V2_COMPATIBILITY_AUTHORITY = ENABLED
FINAL_ACCEPTED_REFERENCE_SHA = 1a8e215b78a3a5008aae6aae36488b3273733b19
PR_207_MERGE_SHA = e4707a3c4267db9d2aadd452782b91045b96724d
POST_MERGE_HARDENING_PR = 209
```

The accepted compatibility port must include the final fail-closed behavior added after the
provisional snapshot, including exact scope/content binding, context-triage signal adjudication,
single-valued protocol authority fields, and the #209 reviewer/verification configuration.

Canonical accepted reviewer bindings are:

- final independent review: `gpt-6-sol / medium` for NORMAL, HIGH and CRITICAL;
- test adequacy: `claude-opus-5-5 / low`;
- CRITICAL and denylisted merge decisions remain human-gated.

## Authority boundary

This decision promotes only the accepted **V2 compatibility reference**. It does not perform the
V3 cutover.

```text
V2 compatibility reference = ACCEPTED
V2 compatibility authority = ENABLED
V3 authority               = SHADOW_ONLY
V3 cutover                  = FH-20
```

The V2 compatibility layer cannot retire legacy behavior, enable V3 merge/release/deploy
authority, or bypass HUMAN_REQUIRED, CRITICAL, denylist, provenance, exact-revision, or semantic
failure gates.

## Reconciliation evidence

The provisional reference is an ancestor of the final #207 head. The reconciliation reviewed the
33-commit delta through #207 and the direct post-merge #209 hardening change. FreeHighlander
parity tests bind the accepted model routes, full verification command set, worker generation
settings, protocol field uniqueness, context-triage content adjudication, test-review scope hash
and final-review scope hash.

## Consequences

- FH-01B2 can close after FreeHighlander full verification and post-port smoke pass.
- FH-01B and FH-01 can close after their child checkpoints are satisfied.
- FH-20 remains the sole V3 authority cutover path.
- Future changes to the accepted V2 reference require a new explicit reconciliation rather than
  silently moving this SHA.
