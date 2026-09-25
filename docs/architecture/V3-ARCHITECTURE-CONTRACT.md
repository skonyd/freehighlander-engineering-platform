# V3 Architecture Contract — Frozen Baseline

**Status:** FROZEN BASELINE  
**Machine-readable source:** `.freehighlander/architecture.yaml`  
**Contract version:** 1.10.0  
**Freeze phase:** FH-10

## Purpose

This document records the accepted architecture direction from ADR-0001 through ADR-0022. Version 1.9.0 accepted the reconciled V2 automation compatibility reference after Creator Marketplace #207/#209; version 1.10.0 adds a delegable dual-model quorum policy state while preserving all V3 foundation authority constraints and SHADOW_ONLY execution.

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

Delegable Full Auto confirmation uses `MODEL_QUORUM_REQUIRED`, not `HUMAN_REQUIRED`. Policy precedence is `ALLOW < MODEL_QUORUM_REQUIRED < HUMAN_REQUIRED < DENY`. Model quorum is evidence only: it cannot satisfy a true human-only gate, override DENY, impersonate HUMAN_APPROVER, or grant execution authority. `SYSTEM_POLICY` must deterministically validate quorum evidence before producing any merge intent. Full Auto defaults OFF and remains SHADOW_ONLY until the normal authority cutover path permits execution.

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

Version 1.5.0 adds `packages/release`. Release readiness is a read-only evidence projection; it cannot deploy, publish tags/releases, execute rollback, or grant authority.

Version 1.6.0 adds `packages/operations`. Service inventory, health snapshots, runbooks and operational intents are read-only/shadow domain state; they cannot mutate live infrastructure or execute operational intents.

Version 1.7.0 adds `packages/incident`. Incident lifecycle, evidence timelines, impact/resource bindings and mitigation intents are read-only/shadow domain state; they cannot mutate infrastructure, execute operational intents or automatically remediate incidents.

Version 1.8.0 adds `packages/lineage`. Stable versioned entities, exact revision bindings, typed evidence-backed relations and bounded read-only traversal form the engineering digital thread. Semantic/vector similarity remains discovery-only and cannot establish authoritative lineage; no graph database is required.

Version 1.9.0 accepts the final V2 compatibility reference at `1a8e215b78a3a5008aae6aae36488b3273733b19`, with #207 merge provenance `e4707a3c4267db9d2aadd452782b91045b96724d` and #209 as the direct post-merge hardening step. This enables the reconciled V2 compatibility authority only; V3 authority remains `SHADOW_ONLY` and FH-20 remains the cutover path.

Version 1.10.0 adds the Full Auto delegable policy effect `MODEL_QUORUM_REQUIRED`. It is distinct from non-delegable `HUMAN_REQUIRED`; unanimous independent model approval remains evidence rather than authority, and current merge execution remains `SHADOW_ONLY`.

### Migration

Until FH-20:

```text
V2 reference             = ACCEPTED
V2 compatibility authority = ENABLED
V3 authority             = SHADOW_ONLY
```

FH-01B2's Creator Marketplace #207 dependency is satisfied by the accepted #207 merge plus direct #209 post-merge hardening reference.

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
