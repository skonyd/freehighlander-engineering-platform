# Architecture Decision Records

Accepted decisions are stored here instead of relying on chat history.

| ADR | Status | Topic |
|---|---|---|
| [ADR-0001](ADR-0001-platform-direction.md) | Accepted direction | V2 automation → engineering platform |
| [ADR-0002](ADR-0002-v2-authority-v3-shadow.md) | Accepted direction | V2 authority / V3 shadow migration |
| [ADR-0003](ADR-0003-initial-product-and-stack.md) | ACCEPTED | local-first, TypeScript monorepo, JSONL/SQLite, repo-as-code workflows |
| [ADR-0004](ADR-0004-provider-adapter-and-fallback.md) | ACCEPTED | provider adapters, capability registry, safe fallback |
| [ADR-0005](ADR-0005-role-authority-and-package.md) | ACCEPTED | logical-role authority and role packages |
| [ADR-0006](ADR-0006-workflow-persistence-and-debate.md) | ACCEPTED | workflow persistence/versioning and debate semantics |
| [ADR-0007](ADR-0007-sandbox-privacy-retention.md) | ACCEPTED | sandbox, privacy, egress and retention |
| [ADR-0008](ADR-0008-engineering-lineage-model.md) | ACCEPTED | engineering lineage / relational knowledge graph |
| [ADR-0009](ADR-0009-model-promotion-and-budget.md) | ACCEPTED | role-based evaluation, model promotion and run budget |
| [ADR-0010](ADR-0010-auth-backup-and-recovery.md) | ACCEPTED | local identity, remote auth, backup and recovery |
| [ADR-0011](ADR-0011-plugin-ecosystem-and-packaging.md) | ACCEPTED | tool/plugin ecosystem and MCP boundary |
| [ADR-0012](ADR-0012-product-packaging-and-monorepo-boundaries.md) | ACCEPTED | product namespace and bounded-context monorepo |

## ADR rule

New ADRs should include:
- context/problem,
- alternatives,
- decision,
- rationale/trade-offs,
- consequences,
- affected requirements/work items,
- status.

A changed accepted decision should normally be superseded by a new ADR rather than silently rewritten.

## Planning-branch cleanup note

FH-00 ADRs were iterated before PR #1 merged. Canonical filenames above are the only authoritative ADR entries for this planning PR. Duplicate draft filenames were removed before merge review.
