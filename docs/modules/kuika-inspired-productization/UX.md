# FH-KUIKA Product UX

**Status:** PROPOSED PRODUCT UX DIRECTION  
**Module:** `FH-KUIKA`  
**Product surface:** optional FreeHighlander Studio productization layer  
**Roadmap:** [FH-KUIKA module roadmap](ROADMAP.md)

## Product UX goal

The optional FH-KUIKA Studio surface is the human-facing productization layer for project state, AI-assisted work, workflows, roles, connectors, evidence, approvals and operations.

The UI must make automation understandable without making UI state authoritative. Execution remains owned by the control plane and published runtime contracts.

## UX principles

1. **The normal AI work path stays simple.** A user should be able to open a project, choose ASK / PLAN / EXECUTE / REVIEW and work without understanding every internal subsystem.
2. **Progressive disclosure.** Advanced routing, evidence, policy, connector and lineage detail is available when needed, but is not part of the default visual path.
3. **FH-KUIKA is optional choice, not the default mental model.** It adds alternative productized workflows and tools on top of the existing FreeHighlander AI work structure.
4. **Authority is visible before action.**
5. **Risk and evidence are first-class concepts, but detailed fields live in drawers/details panels unless action requires them.**
6. **Explain why, not only what happened.**
7. **Draft → Validate → Simulate → Publish** for reusable configuration.
8. **Published workflow/role/blueprint versions are immutable.**
9. **Exact revision context is always available.**
10. **Modes never grant authority.**
11. **Unknown/uncertain state is shown as unknown, not guessed.**
12. **Execution survives UI disconnect.**

## Module navigation contract

FH-KUIKA appears as a separate optional module, but its internal navigation must stay shallow.

The default user experience is:

~~~text
Open project
   ↓
Workbench
   ↓
ASK | PLAN | EXECUTE | REVIEW
   ↓
Run / Result
~~~

FH-KUIKA adds optional alternative tools around that path; it does not replace the path.

Recommended navigation:

~~~text
FREEHIGHLANDER

Core
  Home
  Work
  Runs
  Settings

Modules
  FH-KUIKA
    Overview
    Workbench
    Build
    Integrate
    Knowledge
    Operate
~~~

The detailed capabilities are second-level content inside these six module screens, not additional permanent navigation items:

~~~text
Workbench
  tabs: Ask | Plan | Execute | Review

Build
  cards/tabs: Blueprints | Workflow Studio | Roles | Solution Packs

Integrate
  cards/tabs: Connectors | Models & Routing | Routines

Knowledge
  cards/tabs: Engineering Graph | Evidence | Search

Operate
  cards/tabs: Operations | Approvals | Errors | Routing / Quotas | Audit
~~~

### Simplicity rules

- Maximum one visible navigation level below `FH-KUIKA`.
- ASK / PLAN / EXECUTE / REVIEW are tabs inside Workbench, not menu items.
- Blueprint, workflow, role and connector detail opens inside the current screen or a drawer where practical.
- Advanced diagnostics, hashes, policy detail, evidence metadata and routing internals default to collapsed.
- Common actions use plain labels; protocol/architecture jargon is shown in advanced detail.
- The default screen should show only the information needed for the next decision.
- Command palette/search can reach advanced pages without permanently expanding the menu.
- Module children disappear completely when FH-KUIKA is disabled.
- Core navigation stays usable and stable with or without FH-KUIKA.

Recommended route namespace remains module-scoped:

~~~text
/modules/fh-kuika/overview
/modules/fh-kuika/workbench
/modules/fh-kuika/build
/modules/fh-kuika/integrate
/modules/fh-kuika/knowledge
/modules/fh-kuika/operate
~~~

Deep objects may use nested IDs without creating new sidebar entries, for example:

~~~text
/modules/fh-kuika/build/blueprints/:id
/modules/fh-kuika/build/workflows/:id
/modules/fh-kuika/integrate/connectors/:id
/modules/fh-kuika/operate/runs/:id
~~~

### Module landing page

Selecting `FH-KUIKA` opens a compact overview with only the most useful entry points and attention items.

~~~text
FH-KUIKA                                      OPTIONAL · ENABLED

[ Workbench ]   [ Build ]   [ Integrate ]

Needs attention
  2 approvals
  1 provider fallback

Recent
  Last workflow run
  Last blueprint used

[ Advanced module details ▾ ]
~~~

Version, authority mode, connector inventory, health telemetry and other operational detail belong under the expandable advanced section unless a problem requires attention.

## Global frame

Desktop layout:

~~~text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Project ▾  branch@sha                status / attention                     │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Navigation    │ active work surface                                          │
│               │                                                              │
│               │                                                              │
│               │                                                              │
├───────────────┴──────────────────────────────────────────────────────────────┤
│ Current run / workflow / policy status                                      │
└──────────────────────────────────────────────────────────────────────────────┘
~~~

The exact revision/branch context must never be hidden on any page that can produce or review engineering work.

## Semantic state presentation

State cannot rely on color alone.

Required badges:

- `SHADOW_ONLY`
- `ALLOW`
- `MODEL_QUORUM_REQUIRED`
- `HUMAN_REQUIRED`
- `DENY`
- `STALE`
- `UNRESOLVED`
- `RETRYING`
- `FALLBACK_ACTIVE`

Each badge should include text and an accessible semantic label.

---

# Home

Purpose: answer “what needs my attention?”

Sections:

- active projects
- running/parked workflows
- approvals waiting
- recent critical errors
- provider quota/health
- token/cost summary
- recent security findings
- recent releases/incidents
- “continue last work” entry

No home card may execute a mutation directly. Cards navigate to the responsible control surface.

---

# Workbench

The Workbench is the primary AI-assisted entry point.

## Modes

### ASK

Read-only project/repository explanation.

### PLAN

Produces structured candidate plans, requirements, tasks, ADR candidates and blueprint parameters.

### EXECUTE

Requests an authority-governed workflow. The button does not grant authority.

### REVIEW

Runs an independent exact-revision/evidence review.

## Workbench layout

~~~text
┌──────────────────────────────────────────────────────────────────────┐
│ ASK | PLAN | EXECUTE | REVIEW                                      │
├──────────────────────────────────────────────┬───────────────────────┤
│ Conversation / work output                   │ Context               │
│                                              │ project               │
│                                              │ branch + exact SHA    │
│                                              │ selected files        │
│                                              │ requirement / task    │
│                                              │ workflow / blueprint  │
│                                              │ evidence              │
│                                              │ estimated tokens      │
├──────────────────────────────────────────────┴───────────────────────┤
│ Effective role | risk | policy | tools | provider | expected gates │
└──────────────────────────────────────────────────────────────────────┘
~~~

Context chips are inspectable and removable. The user should be able to see why an evidence/context item was selected.

Before EXECUTE, show a preflight drawer containing:

- logical role(s)
- workflow/blueprint
- exact revision
- effective risk tier
- provider binding/fallback plan
- tools/permissions
- required human/system gates
- token/cost/time budgets
- data/provider-egress result

---

# Runs

## Runs list

Columns/filters:

- run ID
- project
- workflow/version
- exact revision
- state
- human-required state
- active role
- active model/provider
- token/cost
- updated
- error/fallback count

## Run detail

Tabs:

- Overview
- Timeline
- Nodes
- Model calls
- Tool calls
- Gates
- Evidence
- Artifacts
- Errors
- Routing
- Audit

Timeline should merge model/tool/gate/human/error events into one causal sequence.

---

# Explainable Operations Console

Primary objective: make failures actionable without exposing secrets.

## Error card

~~~text
PROVIDER_QUOTA_EXHAUSTED                       RETRYABLE

Provider quota exhausted for implementation role.

Root cause
Provider reported quota exhaustion for the active binding.

Source
model-runtime / provider invocation

Failed step
implementation model call

Observed signal
HTTP/provider quota signal normalized as quota_exhausted

Fallback
gpt-medium selected

Preferred recovery
Next check 01:43

Next action
Continue on fallback; ask before returning to preferred model.

Correlation
fh-...
~~~

If certainty is unresolved:

~~~text
Cause status: UNRESOLVED
Known signal: transport closed before provider response
Do not display a guessed root cause.
~~~

## Routing / quota panel

Display:

- logical role
- preferred binding
- active binding
- eligible fallback chain
- failure class
- cooldown/reset
- next check
- return policy
- independence compatibility
- risk qualification
- token/cost/latency telemetry

---

# Approval Center

Approval rows show:

- decision type
- project/work item
- exact revision
- scope
- reason
- choices
- consequences
- evidence count
- requested at
- current/stale status

Approval detail must compare the parked decision currentness to current project state.

A stale approval cannot silently resume execution.

---

# Blueprint Catalog

Cards show:

- blueprint name/version
- purpose
- default risk
- lifecycle stages
- required roles
- required gates
- connector prerequisites
- usage/quality telemetry
- status: Draft / Published

Actions:

- Inspect
- Clone as draft
- Validate
- Simulate
- Start plan

Starting from a blueprint creates a normal workflow draft/run intent; the blueprint itself does not bypass policy.

---

# Workflow Studio

## Three-panel designer

~~~text
┌ Node palette ┐ ┌──────────────────── Canvas ────────────────────┐ ┌ Inspector ┐
│ MODEL        │ │                                                │ │ Role      │
│ COMMAND      │ │ Plan → Implement → Test → Security → Gate      │ │ Risk      │
│ GATE         │ │                    ↘ Review                    │ │ Budget    │
│ CONDITION    │ │                                                │ │ Evidence  │
│ PARALLEL     │ │                                                │ │ Tools     │
│ DEBATE       │ │                                                │ │ Policy    │
│ LOOP         │ │                                                │ │ Retry     │
│ HUMAN        │ │                                                │ │ Outputs   │
└──────────────┘ └────────────────────────────────────────────────┘ └───────────┘

                         Validate | Simulate | Publish
~~~

## Validation UX

Validation results link to nodes/edges and use explicit categories:

- schema
- graph
- missing reference
- loop bound
- authority incompatibility
- role/binding capability
- human-required path
- budget
- evidence requirement
- sandbox/tool permission

## Version diff

Before publish:

- nodes added/removed/changed
- role version changes
- policy changes
- permission changes
- budget changes
- human gate changes

Authority-sensitive changes should be visually emphasized and require normal governance.

---

# Role Manager / Marketplace

Role detail:

- purpose/version
- authority ceiling
- risk tiers
- allowed/forbidden actions
- prompt/input/output contracts
- evidence policy
- sandbox policy
- independence rules
- tool permissions
- preferred/fallback bindings
- qualification/benchmark history

Install/update screens show a manifest diff before pinning a new version.

---

# Connector Hub

Connector card:

- name/source/protocol
- trust level
- connected/configured state
- version/pin
- number of exposed tools/resources
- health

Connector detail before enablement:

~~~text
Trust: REVIEWED_PINNED
Protocol: MCP
Version: pinned

Requested capabilities
repository.read           ALLOW
repository.write          REVIEW REQUIRED
git.merge                 HUMAN/SYSTEM POLICY
network                    github.com
secrets                    GITHUB_TOKEN handle
filesystem                 none
~~~

Permission changes must produce a diff.

Raw secret values are never displayed after binding.

---

# Models & Providers

Views:

- Providers
- Model Catalog
- Qualifications
- Role Bindings
- Failover Plans
- Quota/Health

Role-binding editor shows:

- preferred
- ordered fallbacks
- provider/model capability
- risk qualification
- independence group
- return policy
- cooldown/recovery policy

Semantic failure must never appear as an allowed fallback reason.

---

# Knowledge / Engineering Graph

Two coordinated views:

1. Search/query results
2. Graph/evidence explorer

Example:

~~~text
REQ-118
  ↓ implemented_by
TASK-391
  ↓ changed_by
PR-842
  ↓ verified_by
TEST-802
  ↓ released_as
v1.8.3
  ↓ observed_in
INC-44
~~~

Every edge should indicate:

- relation type
- evidence/source
- exact revision/version
- authoritative vs discovery-only status

Semantic similarity results must be labeled discovery-only.

---

# Routines

Table fields:

- routine
- trigger
- workflow
- enabled
- last run
- next run
- required authority
- connector dependency
- secret dependency
- failure state

Routine editor:

~~~text
Trigger → Filters → Workflow → Concurrency → Retry → Authority → Publish
~~~

A routine cannot make an authority-bearing workflow executable if the underlying policy does not allow it.

---

# Command palette

Search targets:

- projects
- runs
- workflows
- blueprints
- roles
- connectors
- models
- requirements/ADRs/tasks
- evidence
- correlation IDs

Safe commands may be available from the palette. Mutation-capable commands open preflight/approval surfaces and never bypass normal policy.

---

# First-run onboarding

1. Open/connect a repository/project.
2. Run architecture/project inspection.
3. Configure a provider/model or local endpoint.
4. Validate model qualification.
5. Inspect/install a trusted role pack.
6. Open a blueprint.
7. Simulate a workflow.
8. Use ASK/PLAN.
9. Only expose EXECUTE when effective authority permits it.

Onboarding should remain useful in `SHADOW_ONLY`.

---

# Responsive behavior

Desktop is the primary engineering surface.

Tablet:

- collapsible nav
- canvas inspector as drawer
- evidence/error detail as full-width drawer

Phone:

- monitoring, approvals and error inspection only are initial priority
- complex workflow authoring is not a first-release phone requirement

---

# Accessibility

Minimum expectations:

- keyboard navigation for primary Studio flows
- visible focus state
- labels for icons
- no status conveyed only by color
- semantic headings/tables
- command palette keyboard access
- screen-reader text for hash/revision abbreviations
- reduced-motion compatibility for graph/timeline animations

---

# Publish lifecycle

Reusable definitions use:

~~~text
Draft
  ↓
Validate
  ↓
Simulate
  ↓
Review diff
  ↓
Publish immutable version
~~~

A running workflow remains pinned to its original published snapshot.

UI drafts are not runtime authority.

---

# UX acceptance checks

Every new Studio feature should be reviewed against:

- Can the user see exact revision/project context?
- Can the user identify effective authority and risk?
- Can the user understand why the system selected a model/tool/path?
- Can a failure expose an actionable cause without leaking a secret?
- Can stale evidence/approval be distinguished?
- Can the UI accidentally imply authority it does not own?
- Does disconnecting the UI leave execution correct?
- Does the screen have loading, empty, error and denied states?
