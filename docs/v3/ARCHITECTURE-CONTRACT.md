# V3 Architecture Contract

**Status:** ACCEPTED DIRECTION — implementation contract evolves by ADR  
**Contract version:** 1.12.0

## Goal

V2 shell reference implementation'ını reusable, provider-neutral engineering control plane'e strangler migration ile dönüştürmek.

## Planes

~~~text
CONTROL PLANE
- orchestrator / explicit state machine
- policy + authority
- role/binding router
- scheduler / budgets / deadlines
- artifact/evidence/lineage manager
- state/event persistence
- approvals

EXECUTION PLANE
- model provider adapters
- Git/SCM
- deterministic commands/tests
- sandboxed tools/plugins/MCP
- scanners/runtime integrations
~~~

Provider/model/tool change must not silently change core state/authority semantics.

## State and event model

FreeHighlander **full event sourcing zorunluluğu koymaz**.

Initial model:
- append-only structured event history/audit
- transactional/current-state projections in SQLite
- artifacts/content outside DB where appropriate
- replay/simulation uses persisted events + execution snapshots where sufficient

JSONL is initial telemetry/audit transport; SQLite becomes query/current-state/metadata store.

## Persistence targets

Initial SQLite read model/state includes concepts such as:
- runs / node_runs
- events
- artifacts metadata
- model_calls
- approvals
- findings/adjudications
- provider_health
- benchmark samples
- entities/entity_versions/relations

## Immutable run execution contract

Run start pins:
- workflow id/version/hash
- role package versions/hashes
- policy hash
- prompt contract versions
- resolved bindings/capability snapshot
- repository exact revision(s)
- budget/deadline config

Published definitions can change only for future runs.

## Provider/runtime

Core uses ProviderAdapter + capability registry.

Binding records:
- provider/model/version
- effort/verbosity
- quota group
- independence group
- context/capabilities
- cache/token-count capabilities

Fallback only on policy-approved availability classes and cannot collapse required independence.

## Authority

Logical-role authority classes:
ADVISORY, CANDIDATE, WRITER, ADJUDICATOR, FINAL_REVIEWER, HUMAN_APPROVER, SYSTEM_POLICY.

Workflow/prompt/model cannot elevate itself above policy.

## Context / evidence

Every expensive/authoritative model call should eventually receive a deterministic context packet with:
- exact revision
- required evidence
- inclusion manifest/reasons
- packet hash
- truncation disclosure

Required evidence cannot be removed for token budget.

## Artifact / lineage

Authoritative artifact binds:
- run/workflow/node
- exact revision
- logical role
- binding/provider/model/effort
- prompt/contract/policy hashes
- input packet hash
- output hash
- parent/evidence artifacts

Project lineage uses relational-first versioned entity/relation model.

## Human approval

Approval is first-class:
- stable actor
- exact revision
- scope/action
- reviewed evidence
- timestamp
- policy context

## Sandbox / privacy

Effective permission is intersection of role, workflow node, sandbox/data policy and human approval.

Default-deny:
- filesystem outside workspace
- network
- secrets
- destructive/high-impact actions

Data egress respects PUBLIC/INTERNAL/CONFIDENTIAL/SECRET classification.

## Tools / plugins

Core owns ToolAdapter/permission contract.

MCP is preferred external interoperability protocol where appropriate; external tool discovery/metadata never grants authority.

## Budget / eval

Routing uses role-specific benchmark and quality/cost data.

Budget exhaustion is operational stop/escalation, not PASS.

## Replay / simulation / recovery

Target capabilities:
- models-disabled replay
- alternate router/policy simulation
- historical regression
- crash-safe continuation
- consistent DB/artifact backup and validated restore

## FH-20 authority cutover

ADR-0024 applies V3 authority to exact target
`57761b7b0257c234ad41314343a22dfd53668364`.

Current boundary:

- V3 core authority: `ENABLED`
- V2 compatibility/reference: `ENABLED`
- Code/Git: default `DENY`
- Release/Deploy: default `DENY`
- Infrastructure Mutation: default `DENY`
- Automatic Remediation: default `DENY`
- selected critical capabilities: none
- Full Auto: independently OFF/SHADOW by default

Post-cutover eligibility is not blanket execution permission. Every authority-bearing action still passes
the relevant SYSTEM_POLICY, exact-currentness/evidence, sandbox/data/secret and human gates.

## Enterprise identity / collaboration boundary

ADR-0023 permits authority-neutral preparation for enterprise identity while preserving the local-first architecture.

Initial enterprise identity mode is single-tenant:

- one organization persistence boundary;
- stable LOCAL_USER/OIDC_USER actor identities;
- users/teams/project membership and product-level access roles;
- OIDC subject bindings as identity metadata;
- approval delegation as DRAFT metadata only before later activation;
- no multi-tenant persistence;
- no identity/session metadata may elevate logical-role authority.

Product RBAC eligibility is separate from workflow/model authority, exact human approval and SYSTEM_POLICY. An authenticated or RBAC-eligible actor is not automatically authorized to execute a workflow or satisfy an approval.

Live OIDC/session enforcement, active delegation and multi-tenant persistence require later reviewed activation work.

## UI / CLI

UI and CLI use the same control-plane API/contracts.

V2.5 UI read-only; V3 adds validated Draft → Validate → Simulate → Publish management workflows.
