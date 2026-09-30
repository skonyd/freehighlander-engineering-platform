# FH-20 — V3 authority cutover readiness

**Issue:** #64  
**Status:** COMPLETE / CUTOVER APPLIED  
**Authority effect:** V3 CORE AUTHORITY ENABLED BY EXPLICIT CUTOVER

## Objective

Make the final V3 authority cutover prerequisites executable and fail-closed without promoting V3 before the accepted V2 reference and explicit human/policy review exist.

## Readiness prerequisites

1. V2 reference status is `ACCEPTED`.
2. Provisional and final accepted V2 reference SHAs are recorded.
3. Parity evidence is bound to the exact final accepted reference SHA.
4. Provisional-to-final delta has been reviewed.
5. Parity suite passed against the final accepted reference.
6. Post-port smoke passed.
7. Authority promotion was explicitly reviewed.
8. Exact human approval is verified.
9. System policy decision is `ALLOW`.
10. V2/V3 parity status is `PASS`.

## Invariants

```text
readiness evaluation != authority grant
PROVISIONAL reference => BLOCKED
parity PASS alone => BLOCKED
human approval alone => BLOCKED
reference/parity SHA mismatch => BLOCKED
missing prerequisite => BLOCKED
```

The readiness gate was implemented through PR #65 and merged as `1193d572ff2c0323a79ea2b44eac3df2ccfaebaf`.

Creator Marketplace #207 is no longer the blocker. Its accepted V2 reference was reconciled and promoted through the completed FH-01B path, with final accepted reference SHA `1a8e215b78a3a5008aae6aae36488b3273733b19`.

The final V3 authority cutover is **applied** for exact target
`57761b7b0257c234ad41314343a22dfd53668364`.

Satisfied cutover gates:

1. exact human approval: issue #420;
2. canonical SYSTEM_POLICY decision = `ALLOW` from PR #419;
3. explicit V3 promotion review approved by the exact operator decision;
4. final accepted V2 reference/parity/smoke/promotion confirmation preserved.

ADR-0024 and `docs/state/FH-20-CUTOVER-RECORD.md` are the canonical application record.
V3 core authority is `ENABLED`. FH-30B..FH-37B are eligible but not automatically activated;
critical capabilities remain default DENY and unselected.

## Exact-bound approval packet / preview

The pre-application gate was prepared and inspected through an authority-neutral exact packet rather than loose boolean assertions.

The packet binds the proposed promotion to the target V3 revision, accepted/parity V2 reference, run snapshot, evidence bundle, promotion review and human-gate policy, then embeds the canonical `HUMAN_REQUIRED` approval request. Packet/request hashes are recomputed before preview.

The read-only CLI supports only:

```bash
npm run cutover:preview -- packet --input FILE
npm run cutover:preview -- preview --input FILE
```

It does not create human decisions and has no cutover-apply operation. A `READY` preview still reports `authorityEnabled: false` and `cutoverApplied: false`; the actual cutover was applied separately through the reviewed ADR-0024 state transition.

Detailed contract: [FH-20 Exact Cutover Approval Packet](FH-20-CUTOVER-APPROVAL-PACKET.md).

## Verification

```bash
npm run verify
```
