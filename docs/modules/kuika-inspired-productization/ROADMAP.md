# FH-KUIKA — Kuika-inspired Productization Module

**Status:** PROPOSED PRODUCTIZATION ROADMAP  
**Module ID:** `FH-KUIKA`  
**Scope:** Kuika-inspired productization ideas adapted to FreeHighlander engineering-control-plane semantics  
**Module boundary:** optional productization/UX module; not part of core authority semantics  
**Authority state assumed:** V3 remains `SHADOW_ONLY` until FH-20 explicit cutover  
**Canonical UX companion:** [FH-KUIKA Product UX](UX.md)

## Purpose

This roadmap turns FreeHighlander's existing control-plane capabilities into a coherent product surface without changing the core rule that model output is data, never authority.

The goal is not to turn FreeHighlander into a generic low-code application builder. The target remains an **AI engineering control plane** for software lifecycle planning, implementation, review, testing, security, release, operations and incident learning.

The productization layer should expose the capabilities already present in orchestration, governance, model-runtime, evidence, lineage, persistence and the control plane through safe, explainable and versioned UX.

The existing FreeHighlander AI work structure remains the **primary/default way of working**. FH-KUIKA provides optional alternative interfaces, reusable patterns and productized tools around that core flow. A user must not need to understand or enable FH-KUIKA to perform normal AI-assisted engineering work.

## Module boundary

`FH-KUIKA` is an **optional productization module**, not a new source of authority and not a replacement for FreeHighlander core architecture.

The module owns product-facing concepts inspired by Kuika:

- Studio/workbench UX;
- deterministic engineering blueprints;
- visual workflow authoring;
- connector marketplace/manager UX;
- reusable role/solution packs;
- knowledge/lineage exploration UX;
- routines/triggers;
- explainable routing optimization surfaces;
- later enterprise collaboration preparation.

It does **not** own:

- authority semantics;
- policy precedence;
- evidence truth;
- workflow runtime authority;
- provider fallback semantics;
- secret/data-egress policy;
- role authority identity.

Those remain owned by existing FreeHighlander bounded contexts and machine-readable policies.

### Isolation rule

The module must be removable without invalidating the control-plane runtime. Core packages may expose stable contracts/read models to `FH-KUIKA`, but core execution must not depend on the module UI/catalog being present.

### Proposed implementation boundary

Initial implementation should prefer:

~~~text
apps/web                         Studio surfaces
apps/control-plane               intent/read-model APIs
packages/contracts               shared stable contracts only

future bounded contexts only when justified:
packages/blueprints
packages/connectors
packages/knowledge
packages/routines
~~~

Any new package not already allowed by the frozen architecture requires normal architecture-contract evolution before introduction. Avoid a generic `packages/productization` dumping ground.


## Product principles

1. **Authority is always visible.** Every screen that can lead to mutation shows the current authority, risk tier, policy and approval state.
2. **Modes do not grant authority.** ASK / PLAN / EXECUTE / REVIEW are interaction modes only; policy and logical roles remain authoritative.
3. **Draft first, publish second.** Workflows, blueprints, roles and connector configurations follow Draft → Validate → Simulate → Publish.
4. **Published definitions are immutable.** Edits create a new semantic version.
5. **Explainability is a primary UI surface.** Routing, fallback, quota, error, gate and approval decisions expose concise cause/reason/evidence.
6. **Context is bounded.** UI context selection should map to existing context-packet/evidence contracts rather than sending the whole repository by default.
7. **Safe-by-construction integrations.** External connectors are normalized through ToolAdapter/MCP and never inherit authority from remote metadata.
8. **Pre-cutover work remains authority-neutral.** UI, drafts, simulation, inspection and preparation may progress before FH-20; mutation activation must respect existing cutover gates.

## Product information architecture

FH-KUIKA is exposed as a distinct optional module. To avoid UI complexity, only six module entries are permanently visible.

~~~text
FREEHIGHLANDER
├─ Core
│  ├─ Home
│  ├─ Work
│  ├─ Runs
│  └─ Settings
│
└─ Modules
   └─ FH-KUIKA
      ├─ Overview
      ├─ Workbench
      ├─ Build
      ├─ Integrate
      ├─ Knowledge
      └─ Operate
~~~

Sub-capabilities are tabs/cards inside those pages rather than sidebar entries:

- Workbench → Ask / Plan / Execute / Review
- Build → Blueprints / Workflow Studio / Roles / Solution Packs
- Integrate → Connectors / Models & Routing / Routines
- Knowledge → Engineering Graph / Evidence / Search
- Operate → Operations / Approvals / Errors / Routing / Audit

The detailed UX contract is in [FH-KUIKA Product UX](UX.md).

### Complexity budget

New FH-KUIKA features should not automatically create a new top-level screen. A new permanent navigation item requires evidence that it cannot fit coherently under one of the existing six module surfaces.

Advanced state such as hashes, policy evaluation, evidence metadata, provider diagnostics and connector permission matrices should use drawers, tabs or expandable detail by default.

## Delivery waves

### Wave 0 — Product shell and observability, pre-cutover safe

- FH-KUIKA-01 Studio shell + explainable operations
- FH-KUIKA-02 interaction-mode contracts and read-only/draft UX
- FH-KUIKA-03 blueprint catalog contracts and simulation
- FH-KUIKA-04 workflow-studio draft/validate/simulate UX
- FH-KUIKA-05 connector catalog/permission inspection and configuration drafts

No Wave 0 item may independently enable V3 mutation authority.

### Wave 1 — Reusable engineering product surfaces

- FH-KUIKA-06 role marketplace + solution packs
- FH-KUIKA-07 engineering knowledge vault / lineage-aware retrieval
- FH-KUIKA-08 routine and event-trigger definitions
- FH-KUIKA-09 constraint-aware pre-call router optimizer

Activation of write-capable workflows/connectors/routines must follow FH-20 and the relevant module authority gates.

### Wave 2 — Enterprise collaboration boundary

- FH-KUIKA-10 multi-user identity / RBAC / organization readiness

FH-KUIKA-10 changes the initial local-first single-user product boundary and therefore requires a dedicated ADR, architecture-contract version bump and security threat-model update before implementation.

---

# FH-KUIKA-01 — Studio Shell + Explainable Operations Console

**Priority:** P0  
**Value:** very high  
**Pre-cutover:** yes, if read-only/control-intent only

## Outcomes

Replace the telemetry-only feeling with a product-grade Studio shell while reusing the existing web/control-plane separation.

Primary screens:

- Home / project health
- Runs
- Run detail
- Errors
- Provider/Quota health
- Approval inbox
- Evidence drawer
- Audit/event timeline

## Operations Console requirements

Every provider/runtime failure should render structured diagnosis when available:

~~~text
[PROVIDER_QUOTA_EXHAUSTED]
Headline
Root cause
Source component / operation
Failed step
Observed signal
Retry at
Fallback selected
Preferred-model recovery state
Next action
Correlation ID
~~~

Provider-routing panel should show:

- logical role
- preferred binding
- active binding
- fallback chain
- current cooldown
- next recovery check
- return policy: STAY / ASK / AUTO
- exact reason for switching
- qualification/risk compatibility
- cost/token/latency summary

## Proposed PR slices

- **FH-KUIKA-01.1** Studio navigation shell, project switcher, command palette and consistent page layout.
- **FH-KUIKA-01.2** Operations Console read model for structured runtime errors and routing transitions.
- **FH-KUIKA-01.3** Run detail redesign with timeline, evidence, model/tool calls and gate decisions.
- **FH-KUIKA-01.4** Approval Inbox read surface with exact revision/scope/currentness visualization.
- **FH-KUIKA-01.5** accessibility/responsive/persistent-filter polish and UX contract tests.

## Main impact

- `apps/web`
- `apps/control-plane`
- `packages/persistence`
- `packages/contracts`
- telemetry/read-model projections

## Acceptance criteria

- UI never invents a root cause when diagnosis certainty is unresolved.
- secret-like details remain redacted.
- UI cannot grant authority directly.
- all displayed approval/routing/error states map to canonical contracts.
- run execution survives UI disconnect.

---

# FH-KUIKA-02 — Engineering Workbench: ASK / PLAN / EXECUTE / REVIEW

**Priority:** P0  
**Value:** very high  
**Pre-cutover:** ASK/PLAN/REVIEW preparation yes; EXECUTE activation subject to authority

## Intent

Provide one conversational/workbench entry point with four explicit modes.

### ASK

Read-only explanation and repository/project query.

### PLAN

Produces requirement/task/architecture/workflow candidates and change plans but no mutation authority.

### EXECUTE

Requests bounded writer workflows. EXECUTE is not itself authority and must pass role, sandbox, data, risk and system-policy gates.

### REVIEW

Independent evaluation of an exact revision/evidence set. Producer self-approval remains forbidden.

## Context UX

Context chips should be explicit and inspectable:

- active project
- branch / exact revision
- selected files
- requirement/task/ADR
- run/evidence bundle
- selected workflow/blueprint
- connector/tool capabilities
- token estimate

Users should be able to inspect why an item was included in the context packet.

## Proposed PR slices

- **FH-KUIKA-02.1** interaction-mode contract and authority-neutral intent objects.
- **FH-KUIKA-02.2** Workbench UI with mode selector and context chips.
- **FH-KUIKA-02.3** PLAN output → structured candidate work items/blueprint parameters.
- **FH-KUIKA-02.4** REVIEW → exact-revision independent-review entry.
- **FH-KUIKA-02.5** EXECUTE control-plane intent activation after required authority gates.

## Acceptance criteria

- mode identity cannot raise role authority.
- ASK never mutates project/repository state.
- PLAN outputs are candidates until accepted by normal governance.
- REVIEW requires exact-revision/evidence binding.
- EXECUTE displays effective role, risk, workflow and policy before start.

---

# FH-KUIKA-03 — Engineering Blueprint Catalog

**Priority:** P0  
**Value:** very high  
**Pre-cutover:** yes for catalog/validation/simulation

## Intent

Convert frequent engineering intents into deterministic, versioned engineering patterns rather than asking a model to reinvent the lifecycle every time.

Initial blueprints:

- feature implementation
- bug fix
- security patch
- dependency upgrade
- database migration
- refactor
- release preparation
- hotfix
- incident response
- performance regression
- provider/model migration
- architecture change

## Blueprint contract

Each blueprint should define at minimum:

- id + semantic version
- compatible intent classes
- default risk tier
- required lifecycle stages
- required evidence
- required roles
- independence constraints
- workflow template reference
- optional parameters
- authority-sensitive nodes
- validation rules
- simulation fixtures

Blueprint selection may be suggested by a model, but publication/execution semantics remain deterministic.

## UX

Blueprint Catalog cards show:

- purpose
- risk
- stages
- required roles
- expected gates
- compatible project types
- last version
- usage count / success telemetry
- Validate / Simulate / Start from blueprint

Blueprint detail includes a visual lifecycle preview and generated workflow diff before publish.

## Proposed PR slices

- **FH-KUIKA-03.1** blueprint schema/package and versioning.
- **FH-KUIKA-03.2** deterministic matcher interface and candidate-scoring evidence.
- **FH-KUIKA-03.3** initial curated blueprint pack.
- **FH-KUIKA-03.4** catalog UI and blueprint detail.
- **FH-KUIKA-03.5** blueprint → workflow draft generation and simulation.
- **FH-KUIKA-03.6** measured blueprint quality/usage telemetry.

## Acceptance criteria

- model suggestion cannot silently modify a published blueprint.
- blueprint execution resolves to a normal immutable workflow snapshot.
- authority requirements cannot be weakened by blueprint parameters.
- blueprint version and hash are recorded in run lineage.

---

# FH-KUIKA-04 — Visual Workflow Studio

**Priority:** P0  
**Value:** high  
**Pre-cutover:** draft/validate/simulate yes

## Intent

Expose the existing workflow DAG/state machine as a visual authoring surface while retaining the FreeHighlander Workflow Spec as the canonical representation.

Do not make BPMN the canonical runtime model. BPMN import/export may be a future adapter.

## Node palette

- MODEL
- COMMAND
- GATE
- CONDITION
- PARALLEL
- AGGREGATE
- DEBATE
- LOOP
- HUMAN
- SUBWORKFLOW

## Inspector

Selecting a node exposes:

- logical role
- bindings
- risk tier
- timeout/retry
- token/cost/time budget
- input/output mapping
- required evidence
- sandbox policy
- tool permissions
- approval policy
- transition rules

## Designer layout

~~~text
┌ Node palette ┐  ┌──────────── Canvas ─────────────┐  ┌ Inspector ┐
│ Model        │  │ Plan → Implement → Test         │  │ Role      │
│ Gate         │  │              ↘ Security → Gate  │  │ Risk      │
│ Human        │  │                                 │  │ Evidence  │
│ Debate       │  │                                 │  │ Policy    │
└──────────────┘  └─────────────────────────────────┘  └───────────┘
                         Validate | Simulate | Publish
~~~

## Proposed PR slices

- **FH-KUIKA-04.1** workflow draft/read contract and canonical round-trip.
- **FH-KUIKA-04.2** graph canvas + node palette.
- **FH-KUIKA-04.3** node inspector + policy/evidence/budget surfaces.
- **FH-KUIKA-04.4** deterministic validation visualization.
- **FH-KUIKA-04.5** simulation/replay preview.
- **FH-KUIKA-04.6** publish/version-diff lifecycle.

## Acceptance criteria

- UI round-trip does not change canonical semantics.
- invalid/unbounded/authority-incompatible graphs fail closed.
- published versions are immutable.
- current runs stay pinned to their original snapshot.

---

# FH-KUIKA-05 — Connector Hub / MCP Tool Manager

**Priority:** P0  
**Value:** high  
**Pre-cutover:** catalog, permission review and configuration drafts yes

## Intent

Productize ADR-0011 and `.freehighlander/plugin-policy.yaml` into a safe connector experience.

Initial connector categories:

- source control: GitHub/GitLab
- issue/project: Jira/Linear
- messaging: Slack/Teams
- CI/CD
- Kubernetes
- observability: Prometheus/Sentry/Datadog
- security: Trivy/SonarQube
- secrets: Vault-compatible brokers
- generic MCP server
- generic OpenAPI/HTTP adapter where explicitly reviewed

## Connector detail

Show before enablement:

- source/protocol
- version/pin
- trust level
- tools/resources discovered
- requested filesystem scope
- network destinations
- secret handles
- mutation capability
- role allowlists
- data classification
- human/system-policy requirements
- provenance/signature where available

## Proposed PR slices

- **FH-KUIKA-05.1** ToolAdapter registry persistence/read model.
- **FH-KUIKA-05.2** MCP discovery/normalization adapter.
- **FH-KUIKA-05.3** connector install-review contract and permission diff.
- **FH-KUIKA-05.4** Connector Hub UI.
- **FH-KUIKA-05.5** credential-reference configuration using SecretHandle only.
- **FH-KUIKA-05.6** activation/runtime invocation after authority prerequisites.

## Acceptance criteria

- remote metadata never grants authority.
- EXTERNAL_UNTRUSTED remains disabled by default.
- permission changes produce an explicit diff.
- raw secrets are never persisted in connector state.
- connector tool execution revalidates permission at invocation time.

---

# FH-KUIKA-06 — Role Marketplace + Engineering Solution Packs

**Priority:** P1  
**Value:** high

## Intent

Turn RoleRegistry and portable role packages into reusable engineering products.

Initial trusted role packs:

- architecture reviewer
- implementation agent
- test reviewer
- security reviewer
- release reviewer
- incident investigator
- dependency-upgrade specialist
- Kubernetes reviewer
- database-migration reviewer
- performance reviewer

Solution Packs combine blueprints, workflows, roles, dashboards and connector requirements.

Initial packs:

- Pull Request Quality Pack
- Security Review Pack
- Release Readiness Pack
- Incident Response Pack
- Dependency Upgrade Pack

## UX

Role card:

- role purpose/version
- authority ceiling
- risk scope
- required evidence
- tool permissions
- preferred/fallback model qualification
- benchmark history
- install/pin/update actions

## Proposed PR slices

- **FH-KUIKA-06.1** package manifest/bundle format.
- **FH-KUIKA-06.2** signed/pinned catalog metadata and provenance.
- **FH-KUIKA-06.3** Role Marketplace UI.
- **FH-KUIKA-06.4** Solution Pack bundle/install planner.
- **FH-KUIKA-06.5** update compatibility/diff and rollback-to-version planning.

---

# FH-KUIKA-07 — Engineering Knowledge Vault / Lineage-RAG

**Priority:** P1  
**Value:** high

## Intent

Provide hybrid engineering retrieval over documents, evidence and the existing digital thread.

Retrieval order should prefer authoritative structured relationships before semantic similarity.

~~~text
Question
  ↓
Exact entity/revision lookup
  ↓
Lineage graph traversal
  ↓
Evidence retrieval
  ↓
Semantic/vector discovery when needed
  ↓
Answer with provenance
~~~

## UX

Knowledge Explorer:

- search/query box
- entity graph
- requirement → ADR → task → code → test → release → incident path
- evidence drawer
- source revision/hash
- relationship type
- discovery confidence
- “authoritative relation” vs “semantic suggestion” distinction

## Proposed PR slices

- **FH-KUIKA-07.1** query/retrieval contracts.
- **FH-KUIKA-07.2** lineage-first hybrid retriever.
- **FH-KUIKA-07.3** bounded local index/vector adapter.
- **FH-KUIKA-07.4** Knowledge Explorer UI.
- **FH-KUIKA-07.5** provenance-bearing answer package.
- **FH-KUIKA-07.6** retrieval eval suite.

## Acceptance criteria

- vector similarity cannot create authoritative lineage.
- every factual engineering answer can expose source/revision provenance.
- SECRET/CONFIDENTIAL data obeys provider-egress policy.
- retrieval remains compatible with local-first operation.

---

# FH-KUIKA-08 — Routines / Trigger Engine

**Priority:** P1  
**Value:** high  
**Authority:** activation-sensitive

## Trigger types

- MANUAL
- CRON
- WEBHOOK
- GIT_EVENT
- CI_EVENT
- RELEASE_EVENT
- INCIDENT_EVENT
- SECURITY_EVENT

## Example routines

- PR opened → independent review + security/test checks
- CI failed → failure classification + evidence collection
- release candidate → release-readiness blueprint
- incident opened → incident timeline/evidence workflow
- scheduled dependency/security review
- preferred-provider recovery check

## UX

Routines page shows:

- trigger
- workflow
- last/next run
- enabled state
- required authority
- connector dependencies
- secret dependencies
- concurrency
- retry/backoff
- recent failures

## Proposed PR slices

- **FH-KUIKA-08.1** trigger contract/event normalization.
- **FH-KUIKA-08.2** routine definitions and deterministic scheduler integration.
- **FH-KUIKA-08.3** webhook/event adapters.
- **FH-KUIKA-08.4** Routines UI.
- **FH-KUIKA-08.5** authority-aware activation and failure/retry telemetry.

---

# FH-KUIKA-09 — Constraint-aware Model / Work Router Optimizer

**Priority:** P1  
**Value:** medium-high

## Intent

Select eligible bindings before a call using deterministic constraints and measured telemetry.

Inputs may include:

- role qualification
- risk tier
- data locality/classification
- provider health
- quota/reset time
- latency
- cost/token budget
- context requirement
- independence group
- benchmark eligibility

The optimizer must remain **pre-call routing only**. It cannot rerun semantic failures across models to shop for a more favorable verdict.

## UX

Routing explanation:

~~~text
Role: security-reviewer
Risk: HIGH
Data: INTERNAL

Claude  eligible / quota unavailable
GPT     eligible / available / selected
Gemini  eligible / available
Local   not qualified for HIGH

Decision: GPT
Reason: preferred binding unavailable; next eligible binding satisfies policy.
~~~

## Proposed PR slices

- **FH-KUIKA-09.1** deterministic constraint model.
- **FH-KUIKA-09.2** routing decision evidence contract.
- **FH-KUIKA-09.3** telemetry-derived cost/latency/availability features.
- **FH-KUIKA-09.4** simulation and what-if UI.
- **FH-KUIKA-09.5** router integration with existing availability-only failover.

---

# FH-KUIKA-10 — Enterprise Collaboration / Identity Boundary

**Priority:** P2 / deferred  
**Value:** strategic, not required for initial local-first product

Possible scope:

- OIDC
- users/teams
- RBAC
- project membership
- approval delegation rules
- organization-level policy
- auditable actor identity
- multi-project/multi-tenant separation

This work is intentionally deferred because it changes the accepted local-first-single-user boundary.

Required before implementation:

1. dedicated ADR;
2. architecture-contract version bump;
3. updated threat model;
4. identity/authorization data model;
5. migration design;
6. explicit decision on single-tenant vs multi-tenant persistence.

---

# UX / visual design direction

## Design language

- desktop-first engineering console, responsive down to tablet
- dense but calm information hierarchy
- dark/light support eventually, but semantic state must never depend on color alone
- monospaced treatment for hashes, revisions, run IDs and provider IDs
- permanent global project/revision context
- clear badges for `SHADOW_ONLY`, `HUMAN_REQUIRED`, `MODEL_QUORUM_REQUIRED`, `DENY`
- side drawers for evidence and diagnostics to avoid losing task context

## Global status bar

Always show:

~~~text
Project | Branch/Revision | Authority Mode | Active Workflow | Token/Cost Budget | Provider Health
~~~

## Command palette

Search/navigate:

- project
- run
- workflow
- blueprint
- role
- connector
- requirement/ADR/task
- error correlation ID

Commands that imply mutation should show effective authority and ask for normal policy approval; the palette itself never bypasses policy.

## Empty states/onboarding

First-run onboarding should guide users through:

1. open/connect project
2. inspect architecture
3. configure model/provider
4. select/install role pack
5. validate a blueprint
6. simulate workflow
7. run ASK/PLAN safely

Do not require write authority to complete onboarding.

---

# Cross-cutting engineering requirements

Every FH-KUIKA-01..FH-KUIKA-10 implementation must include, where applicable:

- TypeScript contracts and schema validation
- deterministic hashes/version pinning
- test coverage and adversarial/fail-closed cases
- telemetry events
- lineage/evidence bindings
- privacy/redaction review
- sandbox/tool permission review
- migration/compatibility handling
- read-model support
- UX loading/empty/error states
- accessibility semantics
- documentation and ADR check

## Architecture-change rules

The following require ADR + architecture contract evolution before activation:

- changing existing authority semantics
- allowing UI mode to imply authority
- changing fallback from availability-only to semantic shopping
- adopting BPMN as canonical workflow semantics
- allowing semantic/vector similarity to establish authoritative lineage
- changing local-first-single-user product mode
- permitting external connector metadata to grant trust/authority

## Non-goals

This roadmap does not add:

- generic drag/drop web/mobile app builder
- generic form/PDF/email designer
- HR/procurement business applications
- consumer chatbot product
- direct model self-promotion to authority
- unrestricted plugin execution

---

# Recommended dependency graph

~~~text
FH-20 explicit authority cutover ──────────────────────────────┐
                                                              │
FH-KUIKA-01 Studio/Operations ──┐                                   │
                         ├─→ FH-KUIKA-02 Workbench ────────┐         │
FH-KUIKA-03 Blueprints ─────────┤                          │         │
                         ├─→ FH-KUIKA-04 Workflow Studio ─┼─→ activation paths
FH-KUIKA-05 Connector Hub ──────┘                          │         │
                                                    │         │
FH-KUIKA-06 Roles/Solution Packs ─────────────────────────┤         │
FH-KUIKA-07 Knowledge/Lineage-RAG ────────────────────────┤         │
FH-KUIKA-08 Routines ─────────────────────────────────────┤─────────┘
FH-KUIKA-09 Router Optimizer ─────────────────────────────┘

FH-KUIKA-10 Enterprise identity is independent strategic work and requires a new architecture decision.
~~~

## Recommended implementation order

1. FH-KUIKA-01
2. FH-KUIKA-02.1–41.4
3. FH-KUIKA-03
4. FH-KUIKA-04
5. FH-KUIKA-05.1–44.5
6. FH-KUIKA-06
7. FH-KUIKA-07
8. FH-KUIKA-09
9. FH-KUIKA-08 definition/UI preparation
10. post-FH-20 activation slices: FH-KUIKA-02.5, FH-KUIKA-05.6, FH-KUIKA-08.5 and other authority-bearing mutations
11. FH-KUIKA-10 only after explicit product-boundary decision

This ordering maximizes visible product value while preserving the current authority boundary.
