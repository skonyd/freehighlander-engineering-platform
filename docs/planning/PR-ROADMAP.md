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
- FH-KUIKA optional productization module is proposed; authority-neutral preparation may proceed before cutover while mutation activation remains gated.
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
- **FH-04B** Zero-Token Core Home Dashboard — .1–.9 complete; read-only and independent of FH-20

## Core Home extension

Detailed implementation plan: [FH-04B-ZERO-TOKEN-CORE-HOME.md](FH-04B-ZERO-TOKEN-CORE-HOME.md).

FH-04B turns the existing telemetry-first FH-04 surface into the default Core Home without introducing any model call on render/refresh. Slices .1–.9 are complete.

Recommended slices:

~~~text
FH-04B.1 zero-token contract + snapshot schema
FH-04B.2 SQLite/local read-model aggregation
FH-04B.3 minimal Core Home UI
FH-04B.4 current work + approvals
FH-04B.5 provider/quota/failover
FH-04B.6 structured errors + attention
FH-04B.7 continuity/findings/local Git
FH-04B.8 UX hardening
FH-04B.9 optional external CI/PR status
~~~

Invariant: Home refresh cannot invoke ProviderAdapter/model inference and remains usable without FH-KUIKA.

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


## Optional productization module — FH-KUIKA

Canonical detailed plan: [FH-KUIKA module roadmap](../modules/kuika-inspired-productization/ROADMAP.md).

| Work item | Product capability | Priority | Pre-cutover scope | Activation dependency |
| --- | --- | --- | --- | --- |
| **FH-KUIKA-01** | Studio shell + Explainable Operations Console | P0 | read-only/read-model/control-intent UX | none for read-only surfaces |
| **FH-KUIKA-02** | ASK / PLAN / EXECUTE / REVIEW Workbench | P0 | ASK/PLAN/REVIEW preparation | EXECUTE obeys authority/cutover |
| **FH-KUIKA-03** | Engineering Blueprint Catalog | P0 | schema/catalog/validate/simulate | execution via normal workflow authority |
| **FH-KUIKA-04** | Visual Workflow Studio | P0 | draft/validate/simulate | publish/execute obeys governance |
| **FH-KUIKA-05** | Connector Hub / MCP Tool Manager | P0 | **.1–.5 COMPLETE authority-neutral** | .6 write-capable activation obeys FH-20/policy |
| **FH-KUIKA-06** | Role Marketplace + Engineering Solution Packs | P1 | package/catalog/install planning | role authority remains policy-bounded |
| **FH-KUIKA-07** | Engineering Knowledge Vault / Lineage-RAG | P1 | retrieval/read-only | no authority from semantic similarity |
| **FH-KUIKA-08** | Routines / Trigger Engine | P1 | trigger/routine definitions and UI | authority-bearing activation post-gate |
| **FH-KUIKA-09** | Constraint-aware model/work router optimizer | P1 | simulation/pre-call routing | must preserve availability-only semantic policy |
| **FH-KUIKA-10** | Enterprise collaboration / identity boundary | P2 | planning only | ADR + architecture version bump required |

### Recommended PR sequence

~~~text
FH-KUIKA-01.1 Studio shell/navigation
  ↓
FH-KUIKA-01.2 Explainable Operations read model
  ↓
FH-KUIKA-01.3 Run detail + evidence/routing/error UX
  ↓
FH-KUIKA-01.4 Approval Inbox
  ↓
FH-KUIKA-02.1 Interaction-mode contracts
  ↓
FH-KUIKA-02.2 Workbench + context chips
  ↓
FH-KUIKA-02.3 PLAN structured outputs
  ↓
FH-KUIKA-02.4 REVIEW exact-revision flow
  ↓
FH-KUIKA-03.1 Blueprint schema/versioning
  ↓
FH-KUIKA-03.2 Deterministic blueprint matcher
  ↓
FH-KUIKA-03.3 Curated blueprint pack
  ↓
FH-KUIKA-03.4 Catalog/detail UX
  ↓
FH-KUIKA-03.5 Blueprint → workflow draft/simulation
  ↓
FH-KUIKA-04.1 Workflow canonical draft round-trip
  ↓
FH-KUIKA-04.2 Canvas/node palette
  ↓
FH-KUIKA-04.3 Inspector: role/risk/budget/evidence/tools
  ↓
FH-KUIKA-04.4 Validation visualization
  ↓
FH-KUIKA-04.5 Simulation/replay
  ↓
FH-KUIKA-04.6 Publish/version diff
  ↓
FH-KUIKA-05.1 ToolAdapter registry projection
  ↓
FH-KUIKA-05.2 MCP normalization
  ↓
FH-KUIKA-05.3 Install/permission-diff contract
  ↓
FH-KUIKA-05.4 Connector Hub UX
  ↓
FH-KUIKA-05.5 SecretHandle credential configuration
  ↓
FH-KUIKA-06 / FH-KUIKA-07 / FH-KUIKA-09
  ↓
FH-KUIKA-08 routine definitions/UI
  ↓
FH-20 + relevant authority gates
  ↓
FH-KUIKA-02.5 / FH-KUIKA-05.6 / FH-KUIKA-08.5 authority-bearing activation
~~~

FH-KUIKA is an optional module and must not become a dependency required for core runtime correctness. This module must not weaken the frozen authority rules. Studio modes, visual editors, blueprints, marketplace metadata, semantic retrieval and connector metadata are never authority by themselves.
