# FH-01 — Implementation Plan

**Status:** SPLIT INTO FH-01A + FH-01B

## Why split

Platform bootstrap does not require the unfinished Creator Marketplace #207 to be authoritative. V2 compatibility does.

This prevents idle time without creating two drifting copies of sensitive gate/provenance behavior.

## FH-01A — Platform Bootstrap

Can start now.

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

Blocked until Creator Marketplace #207 final acceptance + merge + post-merge smoke.

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
accepted #207
      ↓
FH-01B compatibility
      ↓
V2 shell authority + TypeScript contracts
      ↓
V3 shadow/parity
      ↓
native V3 authority
~~~
