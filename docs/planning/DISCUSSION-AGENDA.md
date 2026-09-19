# Discussion Agenda

**Status:** ACTIVE

## Accepted

### D-001 — İlk ürün çalışma modeli
**ACCEPTED:** local-first, single-user first; self-hosted/multi-user yolu korunur.

### D-002 — Backend/UI stack
**ACCEPTED:** TypeScript monorepo; control-plane/web mantıksal ayrımı; SQLite + API/SSE yönü.

### D-003 — Event/source-of-truth
**ACCEPTED:** JSONL telemetry/audit + SQLite query/current-state/metadata; pragmatic event history.

### D-004 — Provider architecture
**ACCEPTED:** vendor-neutral ProviderAdapter, API/CLI/local bindings, capability registry, availability-only fallback. ADR-0004.

### D-005 / D-006 — Authority + role package
**ACCEPTED:** logical-role authority classes + declarative YAML role packages. ADR-0005.

### D-007 / D-008 — Workflow + debate
**ACCEPTED:** repo-as-code immutable published workflows, pinned run snapshot, independent first opinions and bounded debate. ADR-0006.

### D-009 / D-010 / D-018 — Sandbox / retention / privacy
**ACCEPTED:** default-deny sandbox, data classification/provider egress, redaction-before-persist, bounded raw retention. ADR-0007.

### D-011 — Knowledge graph / lineage
**ACCEPTED:** relational-first first-class entity/version/relation model; structured lineage is authoritative, semantic search is discovery; graph DB only if measured need appears. ADR-0008.

### Dashboard
**ACCEPTED:** V2.5 read-only; V3 management/control plane.

## Remaining decisions to finalize in FH-00

1. **D-012 Model promotion thresholds**
2. **D-013 Cost/budget policy**
3. **D-014 Product packaging/naming**
4. **D-015 Auth/identity**
5. **D-016 Backup/restore**
6. **D-017 Plugin/tool ecosystem**
