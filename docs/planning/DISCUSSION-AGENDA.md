# Discussion Agenda

**Status:** ACTIVE

## Accepted

### D-001 — İlk ürün çalışma modeli
**ACCEPTED:** local-first, single-user first. Domain modeli ileride self-hosted/multi-user'a açılabilir.

### D-002 — Backend/UI stack
**ACCEPTED direction:** TypeScript monorepo, control-plane ile web UI mantıksal olarak ayrılır. SQLite + API/SSE yönü korunur.

### D-003 — Event/source-of-truth yaklaşımı
**ACCEPTED:** JSONL ilk telemetry/audit stream; SQLite query/current-state/metadata store; pragmatic event history.

### D-004 — Provider access / adapter / fallback
**ACCEPTED:** vendor-neutral ProviderAdapter; API ve CLI ayrı binding/adapter olabilir; capability registry zorunlu; credentials repo dışında; fallback yalnız availability sınıfında; independence korunur. Ayrıntı: ADR-0004.

### D-005 — Authority matrix
**ACCEPTED:** ADVISORY, CANDIDATE, WRITER, ADJUDICATOR, FINAL_REVIEWER, HUMAN_APPROVER, SYSTEM_POLICY. Authority model isminden veya prompt'tan gelmez. Ayrıntı: ADR-0005.

### D-006 — Role package format
**ACCEPTED:** declarative YAML role package; authority, I/O, evidence, tools, data scope, independence, bindings, execution, evaluation ve sandbox policy içerir. Version run başında pinlenir. Ayrıntı: ADR-0005.

### D-007 — Workflow authoring başlangıcı
**ACCEPTED:** repo-as-code versioned workflow specs; V3 UI Draft → Validate → Simulate → Publish ile immutable version üretir. Run başlangıcında snapshot pinlenir. Ayrıntı: ADR-0006.

### D-008 — Debate semantics
**ACCEPTED:** independent first opinions, bounded rounds, explicit consensus strategy, disagreement escalation, budget enforcement ve raw round artifacts. Consensus policy/human authority'yi override edemez. Ayrıntı: ADR-0006.

### D-011 — Knowledge graph başlangıcı
**ACCEPTED:** relational entity/relationship modeliyle başla; graph DB yalnız ihtiyaç ölçülürse.

### Dashboard
**ACCEPTED:** V2.5 read-only; V3 management/control plane.

## Açık kararlar

1. **D-009 Tool sandbox:** filesystem/network/command boundaries, container vs host.
2. **D-010 Artifact/data retention:** raw prompts/responses, PII/secrets redaction, retention/export/delete.
3. **D-012 Model promotion thresholds:** V2.5 benchmark verisiyle kalibrasyon.
4. **D-013 Cost/budget policy:** per-run/per-role/provider budgets.
5. **D-014 Product packaging/naming:** FreeHighlander adı, package boundaries.
6. **D-015 Auth/identity:** V3 self-hosted/multi-user öncesi.
7. **D-016 Backup/restore:** SQLite/artifacts/event history.
8. **D-017 Plugin/tool ecosystem:** built-in adapter vs external plugin sınırı.
9. **D-018 Data privacy:** project source/prompt data hangi provider'a gidebilir?
