# FH-20 — V3 authority cutover readiness

**Issue:** #64  
**Status:** READINESS COMPLETE / EXTERNAL BLOCKER CLEARED / CUTOVER NOT APPLIED  
**Authority effect:** NONE

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

Actual V3 authority cutover is still **not applied**. The remaining cutover gate is explicit and fail-closed:

1. exact human approval for V3 authority promotion;
2. system policy decision = `ALLOW`;
3. explicit V3 promotion review bound to the accepted reference/current evidence.

Until those conditions are satisfied and recorded, V3 remains `SHADOW_ONLY` and FH-30B..FH-37B activation remains blocked.

## Verification

```bash
npm run verify
```
