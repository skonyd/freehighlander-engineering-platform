# Discussion Agenda

**Status:** COMPLETE FOR FH-00

All foundational architecture/product decisions needed before FH-01 have an accepted direction.

## Accepted decisions

- **D-001 Product mode:** local-first, single-user first; self-hosted/multi-user path preserved.
- **D-002 Stack/topology:** TypeScript monorepo; control-plane/web logical separation; SQLite + API/SSE direction.
- **D-003 Event/source-of-truth:** JSONL telemetry/audit + SQLite query/current-state/metadata.
- **D-004 Provider architecture:** vendor-neutral ProviderAdapter; API/CLI/local bindings; capability registry; availability-only fallback. ADR-0004.
- **D-005 Authority matrix:** ADVISORY, CANDIDATE, WRITER, ADJUDICATOR, FINAL_REVIEWER, HUMAN_APPROVER, SYSTEM_POLICY. ADR-0005.
- **D-006 Role package:** declarative YAML; versioned authority/I-O/evidence/tools/data/independence/bindings/execution/evaluation/sandbox. ADR-0005.
- **D-007 Workflow authoring:** repo-as-code specs; immutable published versions; run snapshot pinning. ADR-0006.
- **D-008 Debate/council:** independent first opinion, bounded rounds, explicit consensus, escalation and budgets. ADR-0006.
- **D-009 Sandbox:** default-deny, repo-scoped filesystem, explicit command/network/secrets, human gate for destructive actions. ADR-0007.
- **D-010 Retention:** redact-before-persist; raw prompts/responses default-off; EPHEMERAL/SHORT/PROJECT/AUDIT classes. ADR-0007.
- **D-011 Knowledge graph/lineage:** relational-first first-class entity/version/relation model; semantic search is discovery, not authority. ADR-0008.
- **D-012 Model promotion:** role-specific shadow benchmark; initial NORMAL/HIGH sample/agreement thresholds; human/policy promotion. ADR-0009.
- **D-013 Cost/budget:** run-scoped token/cost/call/retry/time budgets; reserve-before-call; hard circuit breaker. ADR-0009.
- **D-014 Packaging/naming:** FreeHighlander current internal product name; TypeScript monorepo; `@freehighlander/*` namespace. ADR-0011.
- **D-015 Auth/identity:** no separate login for loopback-only single-user local mode; remote/self-hosted requires standards-based auth with PKCE/scopes and secure token storage. ADR-0010.
- **D-016 Backup/restore:** SQLite-supported online snapshot/backup, artifact manifest/hashes, restore verification, pre-migration backups. ADR-0010.
- **D-017 Plugin/tool ecosystem:** built-ins for core integrations; external integrations through versioned capability manifests, MCP where appropriate, explicit trust/sandbox mapping. ADR-0011.
- **D-018 Privacy/provider egress:** PUBLIC/INTERNAL/CONFIDENTIAL/SECRET classification; SECRET does not go to remote model providers. ADR-0007.

## Not frozen forever

These are accepted implementation directions, not immutable dogma.

Changes require:
1. evidence or changed requirements,
2. a new/superseding ADR where semantics change,
3. updated affected contracts and roadmap,
4. migration/compatibility consideration.

## Next decision point

FH-01 implementation may refine package names/tooling choices, but it should not silently reopen the foundational authority, provider, privacy or workflow invariants above.
