# FH-01 — Implementation Plan

**Status:** COMPLETE — FH-01A + FH-01B

## Why split

Platform bootstrap and V2 compatibility were deliberately separated while Creator Marketplace #207 was unfinished. #207 is now merged and the final V2 reference has been reconciled.

This prevents idle time without creating two drifting copies of sensitive gate/provenance behavior.

## FH-01A — Platform Bootstrap

**Status:** COMPLETE.

Scope:
- Node/TypeScript monorepo foundation
- bounded contexts
- control-plane/web skeletons
- ProviderAdapter/failure taxonomy
- role/workflow contracts
- authority/policy primitives
- evidence/artifact contracts
- telemetry event contracts
- persistence ports
- project bootstrap/doctor/resume
- checkpoint preview
- CI and deterministic tests

Explicitly no V2 automation authority.

Canonical detail: `docs/planning/FH-01A-IMPLEMENTATION.md`.

## FH-01B — V2 Compatibility / Authority Port

**Status:** COMPLETE after Creator Marketplace #207 merge, #209 hardening and FreeHighlander PR #237 reconciliation.

Scope:
- accepted reference SHA
- exact-SHA artifact binding
- fail-closed gates
- risk/denylist/human-required
- context triage
- candidate/adjudication separation
- test-review specialist
- independent final reviewer
- trusted provenance writer
- repair rounds
- timeout/quota/fallback safety
- golden/parity regression tests

Canonical detail: `docs/planning/FH-01B-COMPATIBILITY.md`.

## Initial bounded contexts

~~~text
apps/
  control-plane/
  web/

packages/
  orchestration/
  governance/
  model-runtime/
  evidence/
  telemetry/
  persistence/
  contracts/

automation/
  legacy-v2/
~~~

No generic `packages/core` dumping ground.

## Migration

~~~text
FH-01A foundation
      +
accepted #207/#209
      ↓
FH-01B2 accepted compatibility
      ↓
V2 compatibility authority ENABLED
      ↓
V3 shadow/parity
      ↓
FH-20 explicit cutover gate
      ↓
native V3 authority
~~~
