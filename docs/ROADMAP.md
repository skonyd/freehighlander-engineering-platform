# Ana Yol Haritası

## Phase 0 — Creator Marketplace reference implementation'ı kapat
- PR #207 final acceptance
- Sonnet candidate adjudication
- Astra final review
- Human decision
- merge + post-merge smoke

**Çıkış:** V2 automation reference implementation kabul edilir.

## Phase 1 — FreeHighlander Automation Bootstrap
Bu repository artık ürün kodunu da taşıyacaktır.

- TypeScript monorepo iskeleti
- V2 automation davranışının repo-specific adaptation'ı
- local worker/provider bridge'leri
- artifact/provenance/gate/test harness
- CI
- telemetry hook noktaları

**Çıkış:** FreeHighlander kendi geliştirmesini aynı automation ile yönetebilir.

## Phase 2 — V2.5 Telemetry Foundation
- run_id
- append-only event schema
- gate/model/artifact/finding events
- token/latency/retry/timeout/quota
- JSONL
- failure taxonomy

## Phase 3 — SQLite + Read-only Dashboard
- SQLite query/current-state/metadata
- Runs
- timeline
- model calls
- tokens/latency
- findings
- artifacts/provenance
- failures/quota

## Phase 4 — Qwen Shadow Benchmark / Offloading
- repo-analyst
- test-candidate-reviewer
- security-candidate-reviewer
- architecture-consistency-reviewer
- CVE/dependency triage
- independent comparison
- promotion reports

## Phase 5 — Token / Context Optimization
- Qwen evidence/index packets
- safe cache
- duplicate call suppression
- strong-reviewer context shaping
- required full-diff invariants preserved

## Phase 6 — V3 Architecture Freeze
- logical roles
- provider bindings
- authority
- workflow graph
- event/state model
- artifact lineage
- sandbox/secrets
- UI/API contract

## Phase 7 — V3 Control Plane
- provider adapters
- role registry/packages
- workflow DAG/state machine
- debate/council
- policy/human approval
- artifact lineage
- replay/recovery
- management UI

## Phase 8 — V2/V3 Shadow Parity + Cutover
- dual run
- routing/gate/artifact/state/outcome parity
- failure injection
- crash recovery
- V3 authority promotion
- V2 legacy retirement

## Phase 9 — SDLC Modules
1. Planning
2. Development
3. Testing
4. Security
5. Release
6. Operations
7. Incident
8. Project Knowledge Graph / engineering lineage

## Phase 10 — Full lifecycle
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
