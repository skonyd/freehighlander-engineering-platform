# PR Roadmap

**Status:** ACCEPTED DIRECTION / IMPLEMENTATION ADVANCED THROUGH PRE-CUTOVER A-LANE

FH kimlikleri çalışma paketidir; GitHub PR numarası değildir.

## Current execution state

- FH-01A complete.
- FH-01B1 provisional compatibility complete.
- FH-01B2 final reconciliation complete via PR #237.
- FH-02..FH-19 complete.
- FH-20 readiness gate complete; Creator Marketplace external blocker cleared; explicit cutover still pending.
- FH-30A..FH-37A complete and authority-neutral.
- FH-30B..FH-37B remain post-cutover.
- FH-40..FH-49 productization/Studio roadmap is proposed; authority-neutral preparation may proceed before cutover while mutation activation remains gated.
- Pre-cutover hardening through reproducible CI, repository hygiene, tracked-secret enforcement, 19/19 measured native coverage, opaque SecretHandle/EPHEMERAL injection, lockfile provenance, safe vulnerability reporting, deterministic build-output integrity accidental-publish safety, internal workspace dependency-confusion prevention and workspace package entrypoint integrity enforcement, source-to-dist build completeness enforcement, privacy export/delete manifest planning and fail-closed provider-egress preparation are complete.

```text
V2 reference = ACCEPTED
V2 compatibility authority = ENABLED
V3 authority = SHADOW_ONLY
```

## Foundation / automation
- **FH-00** Planning foundation — complete
- **FH-01A** TypeScript monorepo/bootstrap — complete
- **FH-01B1** Provisional V2 compatibility — complete
- **FH-01B2** Accepted V2 reconciliation — complete via PR #237
- **FH-02** Telemetry event schema + emitter — complete
- **FH-03** SQLite telemetry/state index — complete
- **FH-04** Read-only dashboard — complete

## Qwen / economics
- **FH-05** Qwen specialist shadow roles — complete
- **FH-06** Benchmark reconciliation + promotion reports — complete
- **FH-07** Token/context optimization — complete
- **FH-08** Provider health/quota/circuit-breaker telemetry — complete

## V3
- **FH-10** Architecture contract freeze — complete
- **FH-11** Provider adapters + binding registry — complete
- **FH-12** Role registry + role packages — complete
- **FH-13** Workflow DAG + explicit state machine — complete
- **FH-14** Debate/council + disagreement escalation — complete
- **FH-15** Policy-as-code + human approval — complete
- **FH-16** Artifact lineage + hashes — complete
- **FH-17** Replay/simulation + crash recovery — complete
- **FH-18** Management UI — complete
- **FH-19** V2/V3 shadow parity — complete
- **FH-20** V3 authority cutover — readiness complete, external blocker cleared, explicit human/policy cutover pending

## Modules

Each module has an authority-neutral **A** preparation lane and authority-bearing **B** activation lane.

- **FH-30A..FH-37A** — complete
- **FH-30B..FH-37B** — blocked until final FH-20 authority cutover

Canonical split and authority boundaries: [FH-30-37-PRECUTOVER.md](FH-30-37-PRECUTOVER.md).

## FH-01 status

FH-01 did not remain blocked as a whole. The work was split:

```text
FH-01A platform bootstrap                         COMPLETE
FH-01B1 provisional V2 compatibility             COMPLETE
FH-01B2 final accepted-V2 reconciliation         COMPLETE
```

The provisional reference was reconciled and promoted to the final accepted V2 reference after Creator Marketplace #207/#209 completion.

## Dependency spine — current

```text
FH-00 → FH-01A/FH-01B1 → FH-02..FH-19 → FH-20 readiness
                                      │
                                      ├──→ FH-30A..FH-37A COMPLETE
                                      │
                                      └──→ pre-cutover hardening COMPLETE
Creator Marketplace #207/#209 COMPLETE
        ↓
FH-01B2 final reconciliation COMPLETE
        ↓
FH-20 explicit human/policy authority cutover
        ↓
FH-30B..FH-37B activation
```

This ordering preserves the distinction between preparation/readiness evidence and authority-bearing activation.


## Productization / Studio lane — FH-40..FH-49

Canonical detailed plan: [FH-40-49-PRODUCTIZATION-ROADMAP.md](FH-40-49-PRODUCTIZATION-ROADMAP.md).

| Work item | Product capability | Priority | Pre-cutover scope | Activation dependency |
| --- | --- | --- | --- | --- |
| **FH-40** | Studio shell + Explainable Operations Console | P0 | read-only/read-model/control-intent UX | none for read-only surfaces |
| **FH-41** | ASK / PLAN / EXECUTE / REVIEW Workbench | P0 | ASK/PLAN/REVIEW preparation | EXECUTE obeys authority/cutover |
| **FH-42** | Engineering Blueprint Catalog | P0 | schema/catalog/validate/simulate | execution via normal workflow authority |
| **FH-43** | Visual Workflow Studio | P0 | draft/validate/simulate | publish/execute obeys governance |
| **FH-44** | Connector Hub / MCP Tool Manager | P0 | discovery/config/permission review | write-capable invocation obeys authority |
| **FH-45** | Role Marketplace + Engineering Solution Packs | P1 | package/catalog/install planning | role authority remains policy-bounded |
| **FH-46** | Engineering Knowledge Vault / Lineage-RAG | P1 | retrieval/read-only | no authority from semantic similarity |
| **FH-47** | Routines / Trigger Engine | P1 | trigger/routine definitions and UI | authority-bearing activation post-gate |
| **FH-48** | Constraint-aware model/work router optimizer | P1 | simulation/pre-call routing | must preserve availability-only semantic policy |
| **FH-49** | Enterprise collaboration / identity boundary | P2 | planning only | ADR + architecture version bump required |

### Recommended PR sequence

~~~text
FH-40.1 Studio shell/navigation
  ↓
FH-40.2 Explainable Operations read model
  ↓
FH-40.3 Run detail + evidence/routing/error UX
  ↓
FH-40.4 Approval Inbox
  ↓
FH-41.1 Interaction-mode contracts
  ↓
FH-41.2 Workbench + context chips
  ↓
FH-41.3 PLAN structured outputs
  ↓
FH-41.4 REVIEW exact-revision flow
  ↓
FH-42.1 Blueprint schema/versioning
  ↓
FH-42.2 Deterministic blueprint matcher
  ↓
FH-42.3 Curated blueprint pack
  ↓
FH-42.4 Catalog/detail UX
  ↓
FH-42.5 Blueprint → workflow draft/simulation
  ↓
FH-43.1 Workflow canonical draft round-trip
  ↓
FH-43.2 Canvas/node palette
  ↓
FH-43.3 Inspector: role/risk/budget/evidence/tools
  ↓
FH-43.4 Validation visualization
  ↓
FH-43.5 Simulation/replay
  ↓
FH-43.6 Publish/version diff
  ↓
FH-44.1 ToolAdapter registry projection
  ↓
FH-44.2 MCP normalization
  ↓
FH-44.3 Install/permission-diff contract
  ↓
FH-44.4 Connector Hub UX
  ↓
FH-44.5 SecretHandle credential configuration
  ↓
FH-45 / FH-46 / FH-48
  ↓
FH-47 routine definitions/UI
  ↓
FH-20 + relevant authority gates
  ↓
FH-41.5 / FH-44.6 / FH-47.5 authority-bearing activation
~~~

This lane must not weaken the frozen authority rules. Studio modes, visual editors, blueprints, marketplace metadata, semantic retrieval and connector metadata are never authority by themselves.
