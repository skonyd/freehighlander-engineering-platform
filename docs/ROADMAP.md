# Ana Yol Haritası

## Phase 0 — Mevcut automation çekirdeğini kapat

- PR #207 final acceptance.
- Sonnet candidate adjudication.
- Astra final review.
- HUMAN REQUIRED terminal durumu.
- İnsan merge kararı.
- Post-merge smoke.

**Çıkış kriteri:** mevcut V2 pipeline güvenilir reference implementation olarak kabul edilir.

---

## Phase 1 — V2.5 Telemetry Foundation

Amaç: rewrite başlamadan önce mevcut sistemin gerçek baseline'ını toplamak.

- Ortak `run_id`.
- Append-only event schema.
- Gate start/end/pass/fail/skip/wait event'leri.
- Model call event'leri.
- Provider/model/role/effort metadata.
- Token, latency, retry, timeout, quota failure.
- Artifact/cache/stale/repair-round event'leri.
- Human-required ve candidate event'leri.

İlk storage: JSONL. Sonraki adım: SQLite.

---

## Phase 2 — Read-only Dashboard

- Runs ekranı.
- Gate timeline.
- Model calls.
- Artifacts/provenance.
- Token ve latency görünümü.
- Failure classification.
- Repair rounds.
- Candidate/finding durumu.
- Qwen vs strong reviewer benchmark sonuçları.

Dashboard authority değildir; yalnız observer'dır.

---

## Phase 3 — Qwen Workload Offloading

Önce düşük riskli / yüksek hacimli roller:

- Context Triage.
- Repository Analysis.
- Deep Analysis.
- Failure Analysis.
- Pre-review.
- Evidence Collection.
- Bounded Implementation.
- Documentation Consistency.

Shadow benchmark ile yeni specialist roller:

- Test Candidate Reviewer.
- Security Candidate Reviewer.
- Architecture Consistency Reviewer.
- CVE / Dependency Triage.

Promotion yalnız benchmark sonucu ile yapılır.

---

## Phase 4 — Token / Context Optimization

- Qwen context indexing.
- Candidate/evidence packet üretimi.
- Strong reviewer'a daha odaklı bağlam.
- Full-diff invariant gerekli roller için korunur.
- Cache ve incremental execution.
- Gereksiz tekrar model çağrılarını önleme.

---

## Phase 5 — V3 Architecture Contract

Koddan önce kararlar:

- Logical roles.
- Provider bindings.
- Fallback semantics.
- Independence rules.
- Authority model.
- Workflow DAG.
- Debate/council semantics.
- Event model.
- Persistence.
- Artifact lineage.
- Policy-as-code.
- Human approvals.
- Sandbox/secrets.
- Replay/simulation.
- UI/control-plane contract.

---

## Phase 6 — V3 Engineering Control Plane

- TypeScript core.
- SQLite state/event store.
- API.
- SSE/live updates.
- Provider abstraction.
- Role registry.
- Role/model router.
- Workflow DAG engine.
- Explicit state machine.
- Existing Bash gates as adapters.

V2 authority, V3 shadow ile başlanır.

---

## Phase 7 — V3 parity + migration

- Aynı task V2 ve V3'te shadow dual-run.
- State transition parity.
- Artifact/provenance parity.
- Gate result parity.
- Failure injection.
- Crash recovery.
- Replay tests.
- V3 authority promotion.
- Legacy Bash'ın kademeli retirement'ı.

---

## Phase 8 — SDLC Modules

Önerilen sıra:

1. Planning
2. Development
3. Testing
4. Security
5. Release
6. Operations
7. Incident

Her modül aynı workflow/role/model/event çekirdeğini kullanır.
