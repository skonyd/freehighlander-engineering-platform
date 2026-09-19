# FH-11 — Provider adapters and binding registry

**Issue:** #40  
**Status:** COMPLETE  
**Authority effect:** NONE

## Objective

Implement deterministic provider registration and versioned model-binding resolution on top of the frozen FH-10 architecture contract.

## Delivered

- provider registry with duplicate/unknown-provider rejection;
- semantic-versioned model binding definitions;
- ordered primary/fallback binding plans;
- capability compatibility checks;
- risk-tier compatibility checks;
- independence-group compatibility checks;
- deterministic binding-plan hashing;
- availability-only fallback selection;
- semantic/malformed failure no-fallback behavior;
- authority-neutral registry guard;
- deterministic unit coverage for fail-closed behavior.

## Invariants

- logical role remains independent from vendor/model;
- binding configuration grants no authority;
- fallback is only allowed after availability-class failures;
- semantic or malformed output cannot trigger model shopping;
- fallback cannot weaken required capability, risk or independence constraints;
- credentials are not part of binding definitions.

## Verification

```bash
npm run verify
```

After protected-main CI passes and this PR merges, canonical state advances to FH-12.
