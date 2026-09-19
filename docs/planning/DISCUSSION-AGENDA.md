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

### D-007 — Workflow authoring başlangıcı
**ACCEPTED direction:** repo-as-code workflow specs. V3 UI versioned publish katmanı ekler.

### D-011 — Knowledge graph başlangıcı
**ACCEPTED:** relational entity/relationship modeliyle başla; graph DB yalnız ihtiyaç ölçülürse.

### Dashboard
**ACCEPTED:** V2.5 read-only; V3 management/control plane.

## Açık kararlar

1. **D-005 Authority matrix:** advisory / candidate / adjudicator / final review / human.
2. **D-006 Role package format:** manifest, prompt versioning, permissions, output schemas, import/export.
3. **D-008 Debate semantics:** consensus, tie, max rounds, arbiter, quota budget.
4. **D-009 Tool sandbox:** filesystem/network/command boundaries, container vs host.
5. **D-010 Artifact/data retention:** raw prompts/responses, PII/secrets redaction, retention/export/delete.
6. **D-012 Model promotion thresholds:** V2.5 benchmark verisiyle kalibrasyon.
7. **D-013 Cost/budget policy:** per-run/per-role/provider budgets.
8. **D-014 Product packaging/naming:** FreeHighlander adı, package boundaries.
9. **D-015 Auth/identity:** V3 self-hosted/multi-user öncesi.
10. **D-016 Backup/restore:** SQLite/artifacts/event history.
11. **D-017 Plugin/tool ecosystem:** built-in adapter vs external plugin sınırı.
12. **D-018 Data privacy:** project source/prompt data hangi provider'a gidebilir?
