# FH-20 — V3 authority cutover readiness

**Issue:** #64  
**Status:** PREPARATION  
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

The current Creator Marketplace #207 reference remains provisional, therefore actual cutover remains blocked and V3 remains `SHADOW_ONLY`.

## Verification

```bash
npm run verify
```
