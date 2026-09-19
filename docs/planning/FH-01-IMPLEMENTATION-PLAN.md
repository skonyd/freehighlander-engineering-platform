# FH-01 — Implementation Plan

**Status:** DRAFT  
**Starts after:** Creator Marketplace PR #207 merge + post-merge smoke.

## Objective

Turn this planning repository into the first executable FreeHighlander codebase and make it capable of managing its own development workflow.

## Scope

### Monorepo bootstrap

Initial target:

~~~text
apps/
  web/
  control-plane/

packages/
  core/
  workflow/
  roles/
  providers/
  policy/
  artifacts/
  telemetry/
  persistence/
  ui-components/

automation/
~~~

Exact package boundaries can still be refined before implementation.

### Toolchain

To decide/pin:
- Node version
- package manager
- TypeScript config
- lint/format/test framework
- build orchestration
- workspace tooling

### Automation adaptation

Carry forward behavior from Creator Marketplace reference implementation:

- exact-SHA review/artifact binding
- context triage
- risk routing
- candidate/adjudication separation
- Opus-style test-review logical role
- independent final review
- human-required policy
- trusted provenance writes
- repair round semantics
- timeout/quota handling

Do not copy marketplace-specific domain/DB checks.

### Continuity executable tooling

Implement:
- `project:bootstrap`
- `project:doctor`
- `project:resume`
- `project:checkpoint`
- state schema validation
- remote pointer reconciliation
- context profile loader

### Token foundation

Implement or prepare interfaces for:
- context packet builder
- token budget guardrails
- prompt contract/version
- model-call reuse keys
- provider token-count capability
- cache telemetry hooks

## Explicit non-scope

FH-01 does not implement:
- full dashboard
- SQLite telemetry UI
- V3 DAG engine
- all providers
- Planning/Security/Incident modules
- autonomous merge authority

## Acceptance criteria

1. Fresh clone can bootstrap deterministically.
2. Repository state can be validated.
3. Resume command reports active phase/PR/blocker/next action.
4. Checkpoint command creates a safe, pushable handoff state.
5. Automation reference behavior has regression coverage.
6. No hard-coded marketplace domain assumptions remain.
7. Initial CI passes.
8. No secrets/runtime artifacts enter source control.
9. Prompt/role/provider boundaries are represented in interfaces even if some are adapters over V2 shell.
10. Product code and automation remain separable enough for V3 migration.

## Migration principle

Use strangler migration:

~~~text
V2 shell behavior
      ↓ wrapped/adapted
TypeScript control interfaces
      ↓ shadow replacements
native V3 implementations
~~~

No big-bang rewrite.
