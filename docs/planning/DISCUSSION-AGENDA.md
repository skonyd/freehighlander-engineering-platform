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
**ACCEPTED:** ADVISORY, CANDIDATE, WRITER, ADJUDICATOR, FINAL_REVIEWER, HUMAN_APPROVER, SYSTEM_POLICY. Ayrıntı: ADR-0005.

### D-006 — Role package format
**ACCEPTED:** declarative YAML role package; authority, I/O, evidence, tools, data scope, independence, bindings, execution, evaluation ve sandbox policy içerir. Ayrıntı: ADR-0005.

### D-007 — Workflow authoring başlangıcı
**ACCEPTED:** repo-as-code versioned workflow specs; immutable publish + run snapshot. Ayrıntı: ADR-0006.

### D-008 — Debate semantics
**ACCEPTED:** independent first opinions, bounded rounds, explicit consensus strategy, disagreement escalation, budget enforcement. Ayrıntı: ADR-0006.

### D-009 — Tool sandbox
**ACCEPTED:** default-deny, repository-scoped filesystem, explicit command/network/secrets capabilities, destructive/high-impact actions için human gate. Ayrıntı: ADR-0007.

### D-010 — Artifact/data retention
**ACCEPTED direction:** redaction-before-persist, raw prompt/response default-off, retention classes EPHEMERAL/SHORT/PROJECT/AUDIT, export/delete/cleanup desteği. Ayrıntı: ADR-0007.

### D-011 — Knowledge graph başlangıcı
**ACCEPTED:** relational entity/relationship modeliyle başla; graph DB yalnız ihtiyaç ölçülürse.

### D-018 — Data privacy / provider egress
**ACCEPTED direction:** PUBLIC/INTERNAL/CONFIDENTIAL/SECRET classification; SECRET remote provider'a çıkmaz; CONFIDENTIAL yalnız approved binding/policy ile. Ayrıntı: ADR-0007.

### Dashboard
**ACCEPTED:** V2.5 read-only; V3 management/control plane.

## Açık kararlar

1. **D-012 Model promotion thresholds:** V2.5 benchmark verisiyle kalibrasyon.
2. **D-013 Cost/budget policy:** per-run/per-role/provider budgets.
3. **D-014 Product packaging/naming:** FreeHighlander adı, package boundaries.
4. **D-015 Auth/identity:** V3 self-hosted/multi-user öncesi.
5. **D-016 Backup/restore:** SQLite/artifacts/event history.
6. **D-017 Plugin/tool ecosystem:** built-in adapter vs external plugin sınırı.
