# FH-01 — Implementation Plan

**Status:** READY AFTER DEPENDENCY  
**Starts after:** Creator Marketplace PR #207 final acceptance + merge + post-merge smoke.

## Objective

Turn the planning repository into the first executable FreeHighlander codebase and make it capable of managing its own development workflow while preserving V2 behavior.

## Initial monorepo bounded contexts

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

Principles:
- no generic shared domain dumping ground
- package = coherent capability/dependency boundary
- UI component library stays inside web until genuine cross-app reuse
- web is client/control UI; workflow execution survives UI disconnect

## Toolchain selection at PR start

Pin exact versions at FH-01 implementation time:
- current supported Node LTS
- package manager/workspace version
- TypeScript version
- format/lint/test framework
- build runner only if it adds measured value

Avoid adding monorepo orchestration framework before the workspace needs it.

## V2 automation adaptation

Preserve behavioral invariants:
- exact-SHA artifact binding
- fail-closed gates
- risk routing / human-required
- context triage
- candidate/adjudication separation
- test-review specialist role
- independent final review
- trusted provenance writes
- repair-round semantics
- timeout/quota/fallback safety

Do not copy Creator Marketplace domain/DB assumptions.

## Continuity executable tooling

Implement:
- `project:bootstrap`
- `project:doctor`
- `project:resume`
- `project:checkpoint`
- state/schema validation
- remote pointer reconciliation
- context profile loader

## Foundation interfaces

Implement or stub with tests:
- ProviderAdapter + capabilities/failure taxonomy
- logical role/role package schema validation
- authority/policy validator
- workflow spec parser/validator for the V2-compatible subset
- context packet builder/manifest
- evidence/artifact interfaces
- semantic model-call reuse key
- sandbox/data-policy interfaces

These interfaces do not imply full native V3 orchestration in FH-01.

## Token/eval foundation

Prepare:
- prompt contract/version registry
- provider token-count optional capability
- token/cached-token telemetry hook
- budget guardrail interface
- benchmark/eval event hooks

## Explicit non-scope

FH-01 does not implement:
- full dashboard
- full native V3 DAG/debate engine
- all providers
- remote multi-user auth
- Planning/Security/Incident product modules
- autonomous merge authority
- graph database

## Acceptance criteria

1. Fresh clone bootstraps deterministically.
2. State/resume/checkpoint validation works.
3. V2 reference automation runs in FreeHighlander repo-specific config.
4. Reference invariants have regression coverage.
5. No marketplace-specific application assumptions remain.
6. Initial CI passes.
7. No secrets/runtime artifacts enter source control.
8. Provider/role/policy/evidence interfaces are vendor-neutral.
9. Context packet and token/evidence preservation are testable.
10. Product code boundaries support V3 strangler migration.
11. Current web UI absence/disconnect cannot invalidate workflow state.
12. Documentation/state checkpoint is remotely reproducible.

## Migration principle

~~~text
V2 shell authority
      ↓ wrap/adapt
TypeScript domain/control interfaces
      ↓ V3 shadow implementations
parity/evals
      ↓
native V3 authority
~~~

No big-bang rewrite.
