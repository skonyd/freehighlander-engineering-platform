# Ana Yol Haritası

## Current status — 2026-09-20

Roadmap fazları tarihsel dependency sırasını gösterir; mevcut implementation durumu ayrıca aşağıda belirtilir.

| Phase | Scope | Current status |
| --- | --- | --- |
| 0 | Creator Marketplace reference acceptance | **EXTERNAL BLOCKER** — #207 final acceptance/merge/smoke pending |
| 1 | FreeHighlander automation bootstrap | **PARTIAL COMPLETE** — FH-01A + FH-01B1 complete; FH-01B2 blocked by #207 |
| 2 | V2.5 telemetry foundation | **COMPLETE** |
| 3 | SQLite + read-only dashboard | **COMPLETE** |
| 4 | Qwen shadow benchmark/offloading | **COMPLETE foundation** |
| 5 | Token/context/provider optimization | **COMPLETE foundation** |
| 6 | V3 architecture freeze | **COMPLETE** |
| 7 | V3 control plane | **COMPLETE through FH-19** |
| 8 | V2/V3 parity + authority cutover | **READINESS COMPLETE / CUTOVER BLOCKED** |
| 9 | SDLC modules | **FH-30A..FH-37A COMPLETE / B-lane BLOCKED** |
| 10 | Authority-bearing full lifecycle | **BLOCKED until FH-01B2/FH-20** |

Current authority state remains:

```text
V2 reference = PROVISIONAL
V3 authority = SHADOW_ONLY
```

## Phase 0 — Creator Marketplace reference implementation

Still required for final authority migration:
- PR #207 final acceptance
- final accepted reference SHA
- merge + post-merge smoke
- FreeHighlander provisional-to-final reconciliation

**Exit:** final V2 reference becomes accepted evidence for FH-01B2/FH-20.

## Phase 1 — FreeHighlander Automation Bootstrap

Completed:
- TypeScript monorepo
- FH-01A platform bootstrap
- FH-01B1 provisional V2 compatibility port
- local worker/provider contracts
- artifact/provenance/gate/test harness
- CI and telemetry foundations

Pending:
- FH-01B2 final accepted-V2 reconciliation after #207.

## Phase 2 — V2.5 Telemetry Foundation — COMPLETE

Delivered append-only engineering events, model/gate/artifact/finding telemetry, usage/latency/failure metadata and durable JSONL history.

## Phase 3 — SQLite + Read-only Dashboard — COMPLETE

Delivered SQLite run/event/artifact read model, deterministic import/indexing, read-only management/dashboard surfaces and verified backup/restore/integrity hardening.

## Phase 4 — Qwen Shadow Benchmark / Offloading — COMPLETE FOUNDATION

Delivered authority-neutral specialist shadow roles, benchmark reconciliation and promotion-candidate reporting. Automatic promotion remains forbidden.

## Phase 5 — Token / Context Optimization — COMPLETE FOUNDATION

Delivered context packets, token-budget preflight, safe cache/reuse identity and availability-only provider resilience.

## Phase 6 — V3 Architecture Freeze — COMPLETE

The frozen architecture contract is currently version **1.8.0**, covering the V3 foundation and FH-30A..FH-37A bounded contexts.

## Phase 7 — V3 Control Plane — COMPLETE THROUGH FH-19

Provider adapters, logical roles, workflow DAG/state machine, debate/council, policy/human approval, artifact lineage, replay/recovery, management UI and V2/V3 shadow parity are implemented.

Authority remains `SHADOW_ONLY`.

## Phase 8 — V2/V3 Shadow Parity + Cutover

Completed:
- FH-19 parity framework
- FH-20 deterministic cutover-readiness evaluator

Blocked:
- final accepted V2 reference from Creator Marketplace #207
- FH-01B2 exact delta reconciliation
- post-port parity/smoke against the final accepted SHA
- explicit human/system-policy authority promotion decision

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

FH-30B..FH-37B activation remains blocked by FH-01B2/FH-20.

## Pre-cutover hardening — COMPLETE THROUGH DEPENDENCY ENFORCEMENT

Independent of #207, the repository now includes:
- executable data-policy and remote-egress enforcement;
- executable sandbox permission evaluation;
- retention/privacy dry-run lifecycle planning;
- verified SQLite backup/restore/integrity checks;
- FH-30A..FH-37A cross-module digital-thread integration;
- privacy-safe hardening telemetry;
- deterministic adversarial/fail-closed test matrices;
- workspace dependency-boundary enforcement.

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
