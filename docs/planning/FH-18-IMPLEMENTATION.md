# FH-18 — Local management UI control surface

**Issue:** #56  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Expose V3 management state in the local web client without moving workflow execution, mutation authority or human approval authority into the UI.

## Scope

- deterministic management snapshot over the existing read model
- human-required event projection
- runs/artifacts/model-call management views
- explicit management intent DTOs
- fail-closed intent parser
- control-plane-required intent authority marker
- read-only local management API endpoint
- client-only foundation capability metadata

## Invariants

```text
web execution owner = control-plane
web mutation authority = none
management intent != execution
UI disconnect != workflow execution change
V3 authority = SHADOW_ONLY
```

Unknown management intents fail closed. Human gates remain HUMAN_REQUIRED until a valid control-plane/governance path records a human decision.

## Verification

```bash
npm run verify
```
