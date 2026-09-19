# Discussion Agenda

**Status:** COMPLETE FOR FH-00

All foundational directions required before FH-01 now have accepted ADRs/contracts.

## Accepted decisions

- **D-001 Product mode:** local-first, single-user first; self-hosted/multi-user path preserved. ADR-0003.
- **D-002 Stack/topology:** TypeScript monorepo; control-plane/web separation; SQLite + API/SSE direction. ADR-0003/0012.
- **D-003 Event/state:** JSONL initial event/audit + SQLite current/query/metadata; no full event-sourcing requirement. ADR-0003.
- **D-004 Provider architecture:** ProviderAdapter + capability registry; API/CLI/local bindings; safe fallback. ADR-0004.
- **D-005 Authority:** logical authority classes; model/prompt does not grant authority. ADR-0005.
- **D-006 Role package:** declarative versioned role contracts. ADR-0005.
- **D-007 Workflow:** repo-as-code specs, immutable publish, run snapshot. ADR-0006.
- **D-008 Debate:** independent first opinions, bounded rounds/budgets, explicit escalation. ADR-0006.
- **D-009 Sandbox:** default-deny execution/data capabilities. ADR-0007.
- **D-010 Retention:** redact-before-persist; raw capture default-off; retention classes. ADR-0007.
- **D-011 Lineage:** relational-first versioned entities/relations; semantic search discovery only. ADR-0008.
- **D-012 Promotion:** role-specific shadow/evals; provisional floors; human/policy promotion. ADR-0009.
- **D-013 Budget:** run/role/provider budget; reserve/reconcile; hard stop is operational state. ADR-0009.
- **D-014 Packaging/naming:** FreeHighlander internal namespace; bounded-context monorepo; public branding deferred. ADR-0012.
- **D-015 Auth/identity:** loopback-only local first; non-loopback requires auth; stable approval actor. ADR-0010.
- **D-016 Backup/restore:** SQLite-supported consistent snapshot + artifact manifest + restore drill. ADR-0010.
- **D-017 Plugin/tool ecosystem:** internal ToolAdapter; MCP preferred external interoperability; explicit trust/sandbox. ADR-0011.
- **D-018 Privacy/egress:** PUBLIC/INTERNAL/CONFIDENTIAL/SECRET; SECRET remote model egress denied. ADR-0007.

## Intentionally deferred tuning, not architectural blockers

- exact framework/package-manager versions
- exact OIDC provider
- numeric RPO/RTO
- numeric cost/token budgets
- public launch brand
- graph DB adoption
- promotion thresholds recalibration after V2.5 data

Changes to accepted semantics require evidence + superseding ADR where appropriate.
