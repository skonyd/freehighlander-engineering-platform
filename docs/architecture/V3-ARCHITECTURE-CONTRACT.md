# V3 Architecture Contract — Frozen Baseline

**Status:** FROZEN BASELINE  
**Machine-readable source:** `.freehighlander/architecture.yaml`  
**Contract version:** 1.6.0  
**Freeze phase:** FH-10

## Purpose

This document records the accepted architecture direction from ADR-0001 through ADR-0018. Version 1.6.0 adds the Operations module alongside the existing pre-cutover module contexts while preserving all V3 foundation authority constraints.

The machine-readable contract is normative for automated drift checks. Existing ADRs remain the decision rationale.

## Contract surfaces

### Product and boundaries

- local-first single-user initial product mode;
- TypeScript bounded-context monorepo;
- no generic `packages/core` domain dumping ground;
- control plane and execution plane remain logically separated;
- web is a client/control UI and does not own workflow execution lifetime.

### Authority

Authority belongs to logical roles and policy, not model/provider/prompt identity.

Frozen levels:

```text
ADVISORY
CANDIDATE
WRITER
ADJUDICATOR
FINAL_REVIEWER
HUMAN_APPROVER
SYSTEM_POLICY
```

Producer cannot become final approver merely by configuration. HUMAN_APPROVER requires a human principal; SYSTEM_POLICY requires a system principal.

### Providers

Core depends on `ProviderAdapter`, not vendor-native response schemas.

Fallback is availability-only. Semantic FAIL/BLOCKED/INSUFFICIENT or malformed semantic output cannot be model-shopped into a favorable verdict.

Provider health is operational state, not semantic quality.

### Roles and workflows

- role identity is logical-role based;
- published role/workflow versions are pinned into a run snapshot;
- workflow primitive set is frozen for V3 foundation;
- loops and debate rounds are bounded;
- debate consensus is not authority;
- unknown tool permission is DENY.

### Evidence and telemetry

- authoritative evidence binds to exact revision/input/policy/contract identity;
- summaries do not replace raw evidence required by a gate;
- telemetry is append-only with SQLite query/current-state projection;
- raw prompt/response retention is not enabled by default.

### Security

- execution and network permission default to DENY;
- plaintext secrets do not belong in repository/state/artifacts;
- SECRET data is not sent to remote providers by default;
- destructive/high-impact mutations may require a human gate.

### Evaluation and budgets

- evaluation is logical-role × risk-tier × evidence-profile;
- no automatic authority promotion;
- required evidence is not truncated to satisfy budget;
- no semantic model-shopping after verdict.

### Module bounded contexts

ADR-0013 permits coherent module packages to be introduced incrementally before
final authority cutover, provided they remain authority-neutral.

Version 1.1.0 adds:

```text
packages/planning
```

Planning readiness is domain state only. It cannot authorize execution, merge,
release, deployment or policy bypass. Later module packages follow the same
coherent-boundary rule and require normal contract evolution.

Version 1.5.0 adds `packages/release`. Release readiness is a read-only evidence projection; it cannot deploy, publish tags/releases, execute rollback, or grant authority.\n\nVersion 1.6.0 adds `packages/operations`. Service inventory, health snapshots, runbooks and operational intents are read-only/shadow domain state; they cannot mutate live infrastructure or execute operational intents.

### Migration

Until FH-20:

```text
V2 reference = PROVISIONAL
V3 authority = SHADOW_ONLY
```

FH-01B2 remains independently blocked on Creator Marketplace #207.

## Change rule

A semantic change to this frozen baseline requires:

1. a new or superseding ADR;
2. an explicit architecture-contract version bump;
3. machine-readable contract update;
4. deterministic validation update where necessary;
5. normal protected-main PR/CI review.

Documentation clarification that changes no semantics may remain a patch-level documentation edit.

## Inspection

```bash
npm run project:architecture
npm run project:doctor
npm run verify
```

The architecture hash is deterministic over the canonicalized machine-readable contract and can later be bound into workflow/run snapshots.
