# Ana Yol Haritası

## Current status — 2026-09-25

Roadmap fazları tarihsel dependency sırasını gösterir; mevcut implementation durumu ayrıca aşağıda belirtilir.

| Phase | Scope | Current status |
| --- | --- | --- |
| 0 | Creator Marketplace reference acceptance | **COMPLETE** — #207 merged, #209 hardening merged, final accepted SHA recorded |
| 1 | FreeHighlander automation bootstrap | **COMPLETE** — FH-01A + FH-01B1 + FH-01B2 complete |
| 2 | V2.5 telemetry foundation | **COMPLETE** |
| 3 | SQLite + read-only dashboard | **COMPLETE; FH-04B Core Home .1–.8 COMPLETE** |
| 4 | Qwen shadow benchmark/offloading | **COMPLETE foundation** |
| 5 | Token/context/provider optimization | **COMPLETE foundation** |
| 6 | V3 architecture freeze | **COMPLETE** |
| 7 | V3 control plane | **COMPLETE through FH-19** |
| 8 | V2/V3 parity + authority cutover | **READINESS COMPLETE / EXTERNAL BLOCKER CLEARED / CUTOVER NOT APPLIED** |
| 9 | SDLC modules | **FH-30A..FH-37A COMPLETE / B-lane BLOCKED** |
| 10 | Authority-bearing full lifecycle | **BLOCKED until explicit FH-20 cutover** |
| 11 | Optional Kuika-inspired productization module — FH-KUIKA | **PROPOSED; authority-neutral preparation can proceed** |
| 12 | FH-KUIKA-10 enterprise collaboration submodule | **DEFERRED; ADR required** |

Current authority state remains:

```text
V2 reference = ACCEPTED
V2 compatibility authority = ENABLED
V3 authority = SHADOW_ONLY
```

## Phase 0 — Creator Marketplace reference implementation

Completed:
- Creator Marketplace #207 merged at `e4707a3c4267db9d2aadd452782b91045b96724d`
- direct #209 hardening merged
- final accepted reference SHA `1a8e215b78a3a5008aae6aae36488b3273733b19`
- FreeHighlander FH-01B2 reconciliation merged in PR #237

**Exit:** final V2 reference is accepted evidence for FH-20.

## Phase 1 — FreeHighlander Automation Bootstrap

Completed:
- TypeScript monorepo
- FH-01A platform bootstrap
- FH-01B1 provisional V2 compatibility port
- local worker/provider contracts
- artifact/provenance/gate/test harness
- CI and telemetry foundations

Completed:
- FH-01B2 final accepted-V2 reconciliation after #207/#209.

## Phase 2 — V2.5 Telemetry Foundation — COMPLETE

Delivered append-only engineering events, model/gate/artifact/finding telemetry, usage/latency/failure metadata and durable JSONL history.

## Phase 3 — SQLite + Read-only Dashboard — COMPLETE

Delivered SQLite run/event/artifact read model, deterministic import/indexing, read-only management/dashboard surfaces and verified backup/restore/integrity hardening.

### FH-04B — Zero-Token Core Home extension

FH-04B is the completed Core UI extension to FH-04. It keeps the dashboard fully read-only while making it the default operational Home surface.

Key rule:

~~~text
Home render / refresh
        ↓
SQLite + deterministic read models
        ↓
NO LLM / NO ProviderAdapter / NO model quota
~~~

Delivered core capabilities include current work, attention, approvals, structured errors, provider/quota/failover state, time-window token/cost usage, continuity/checkpoint status, findings, freshness semantics and progressive-disclosure UX. Optional deterministic GitHub/CI enrichment remains a deferred P1 add-on.

Detailed plan: [FH-04B Zero-Token Core Home](planning/FH-04B-ZERO-TOKEN-CORE-HOME.md).

This work is independent of FH-KUIKA and is not blocked by FH-20 while it remains read-only.

## Phase 4 — Qwen Shadow Benchmark / Offloading — COMPLETE FOUNDATION

Delivered authority-neutral specialist shadow roles, benchmark reconciliation and promotion-candidate reporting. Automatic promotion remains forbidden.

## Phase 5 — Token / Context Optimization — COMPLETE FOUNDATION

Delivered context packets, token-budget preflight, safe cache/reuse identity and availability-only provider resilience.

## Phase 6 — V3 Architecture Freeze — COMPLETE

The frozen architecture contract is currently version **1.10.0**, including accepted V2 reconciliation (1.9.0) and Full Auto delegable quorum semantics (1.10.0).

## Phase 7 — V3 Control Plane — COMPLETE THROUGH FH-19

Provider adapters, logical roles, workflow DAG/state machine, debate/council, policy/human approval, artifact lineage, replay/recovery, management UI and V2/V3 shadow parity are implemented.

Authority remains `SHADOW_ONLY`.

## Phase 8 — V2/V3 Shadow Parity + Cutover

Completed:
- FH-19 parity framework
- FH-20 deterministic cutover-readiness evaluator

Completed:
- final accepted V2 reference from Creator Marketplace #207/#209
- FH-01B2 exact delta reconciliation
- post-port parity/smoke against the final accepted SHA

Remaining:
- explicit exact human approval for V3 cutover
- SYSTEM_POLICY = ALLOW
- explicit V3 authority-promotion review

The readiness evaluator cannot enable authority by itself.

## Phase 9 — SDLC Modules

Authority-neutral preparation is complete:

1. FH-30A Planning
2. FH-31A Development
3. FH-32A Testing
4. FH-33A Security
5. FH-34A Release
6. FH-35A Operations
7. FH-36A Incident
8. FH-37A Project Knowledge Graph / Engineering Lineage

FH-30B..FH-37B activation remains blocked by FH-20 only.

## Pre-cutover hardening — COMPLETE THROUGH PROVIDER EGRESS PREPARATION

The repository also includes:
- executable data-policy and remote-egress enforcement;
- executable sandbox permission evaluation;
- retention/privacy dry-run lifecycle planning;
- verified SQLite backup/restore/integrity checks;
- FH-30A..FH-37A cross-module digital-thread integration;
- privacy-safe hardening telemetry;
- deterministic adversarial/fail-closed test matrices;
- workspace dependency-boundary enforcement;
- canonical npm lockfile + npm ci;
- immutable GitHub Action SHA and ubuntu-24.04 pinning;
- checkout credential isolation;
- bounded weekly Dependabot PRs for npm/GitHub Actions;
- reconciled sensitive-path CODEOWNERS;
- deterministic git-tracked high-confidence secret leakage gate;
- measured per-workspace Node 24 native line/branch/function coverage regression floors;
- control-plane contract tests, closing the final untested workspace so coverage inventory is 19/19;
- opaque SecretHandle + role/workflow/sandbox-gated EPHEMERAL injection planning, with persistence/remote-model egress forbidden and real backend adapters deferred;
- deterministic npm lockfile provenance/integrity validation, rejecting non-registry sources, missing sha512 integrity and install-script-bearing external packages;
- safe vulnerability disclosure guidance that treats normal issues in a public repository as public and prefers private vulnerability reporting/security advisories for sensitive details;
- deterministic clean-rebuild output manifests using relative paths, sizes and SHA-256 digests, rejecting symlinked/tracked/missing/extra/changed dist artifacts;
- monorepo accidental-publish enforcement requiring all 19 workspaces to remain private, version 0.0.0 and free of publishConfig/publish lifecycle hooks;
- internal @freehighlander/* dependency-confusion enforcement requiring every package identity to resolve as link=true to its exact local workspace path with exact 0.0.0 internal dependency specs;
- workspace package entrypoint integrity enforcement requiring runtime exports to resolve under dist/, type entrypoints to exist, and all targets to remain inside their workspace boundary;
- source-to-dist completeness enforcement requiring every compiled src/**/*.ts module to emit JavaScript, declaration and source-map artifacts under dist/;
- metadata-only privacy EXPORT/DELETE manifest planning derived from canonical retention policy, with raw owner scope hashed and export/deletion/AUDIT deletion authority disabled;
- fail-closed provider-egress preparation binding classification, canonical policy evaluation, redaction, deterministic sanitized-content hashing and metadata-only telemetry while provider invocation authority remains disabled.

## Phase 10 — Full lifecycle

Authority-bearing lifecycle activation remains future work:

```text
IDEA
 ↓
REQUIREMENT
 ↓
ARCHITECTURE / ADR
 ↓
TASK
 ↓
CODE
 ↓
TEST
 ↓
SECURITY
 ↓
RELEASE
 ↓
PRODUCTION
 ↓
OBSERVABILITY
 ↓
INCIDENT
 └────────────→ REQUIREMENT / TEST / TASK
```

The read-only/evidence contracts for this thread exist today; production mutation authority does not.


## Phase 11 — Optional FH-KUIKA Productization Module

Detailed plan: [FH-KUIKA module roadmap](modules/kuika-inspired-productization/ROADMAP.md).

FH-KUIKA is an optional module that exposes existing control-plane capabilities through a coherent Studio UX. Core runtime correctness must not depend on the presence of this module:

- FH-KUIKA-01 Studio shell + Explainable Operations Console
- FH-KUIKA-02 ASK / PLAN / EXECUTE / REVIEW Workbench
- FH-KUIKA-03 Engineering Blueprint Catalog
- FH-KUIKA-04 Visual Workflow Studio
- FH-KUIKA-05 Connector Hub / MCP Tool Manager
- FH-KUIKA-06 Role Marketplace + Engineering Solution Packs
- FH-KUIKA-07 Engineering Knowledge Vault / Lineage-RAG
- FH-KUIKA-08 Routines / Trigger Engine
- FH-KUIKA-09 Constraint-aware pre-call model/work router optimizer

Authority-neutral schema, read-model, draft, validation, simulation and inspection work can proceed while V3 remains `SHADOW_ONLY`. Any mutation-capable activation must continue to respect FH-20, role authority, sandbox/data policy and system-policy/human gates.

## Phase 12 — Enterprise collaboration boundary

FH-KUIKA-10 covers possible OIDC, teams, RBAC, organization policy and multi-user collaboration.

It is intentionally deferred because the frozen architecture currently defines the initial product as local-first single-user. FH-KUIKA-10 requires a dedicated ADR, architecture-contract version bump and threat-model/data-model work before implementation.
