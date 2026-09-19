# FreeHighlander Engineering Platform

> Fikir aşamasından production operasyonuna kadar yazılım yaşam döngüsünü; değiştirilebilir LLM rolleri, deterministik kapılar, insan otoritesi ve tam mühendislik izlenebilirliği ile yöneten AI destekli engineering platformu.

## Durum

Bu repository **FreeHighlander'ın ana ürün repository'sidir** ve hem ürün kodunu hem de planning/architecture/governance kontratlarını taşır.

Şu anda FH-00 planning foundation tamamlanmış ve review aşamasındadır. Ürün implementation'ı FH-01 ile başlayacaktır.

Bootstrap/reference implementation:
- `skonyd/creator-marketplace`
- PR #207: multi-model automation çekirdeği
- FH-01, #207 final acceptance + merge + post-merge smoke sonrasında başlar.

## Delivery order

1. Creator Marketplace #207 final acceptance + merge + smoke
2. FH-01 TypeScript monorepo + automation bootstrap
3. FH-02 telemetry/event schema
4. FH-03 SQLite state/index
5. FH-04 read-only dashboard
6. FH-05/06 Qwen/local shadow benchmark
7. FH-07/08 token/context + provider optimization
8. FH-10..20 V3 logical role/model/workflow control plane
9. FH-30..37 Planning → Development → Testing → Security → Release → Operations → Incident + lineage

## Resume / another machine

For a fresh clone/model:

> Repo'yu aç. AGENTS.md ve PROJECT_STATE.md'yi oku. 3'lü modda kaldığımız yerden devam et.

Canonical current-state files:
- `AGENTS.md`
- `.freehighlander/state.yaml`
- `PROJECT_STATE.md`
- `docs/state/RESUME-PROTOCOL.md`

## Documentation

Start from [docs/INDEX.md](docs/INDEX.md).

Important:
- [Roadmap](docs/ROADMAP.md)
- [PR Roadmap](docs/planning/PR-ROADMAP.md)
- [FH-00 Final Audit](docs/planning/FH-00-FINAL-AUDIT.md)
- [FH-01 Implementation Plan](docs/planning/FH-01-IMPLEMENTATION-PLAN.md)
- [ADR Index](docs/decisions/README.md)
- [Portable AI Engineering Repo Blueprint](docs/templates/PORTABLE-AI-ENGINEERING-REPO.md)

## Non-negotiable principles

- **LLM output is data, never authority.**
- Model identity does not grant authority.
- Producer cannot independently final-approve its own output.
- Unknown/unverifiable gate fails closed.
- Exact revision/evidence binding is required for authoritative artifacts.
- Fallback is for availability/budget-before-call routing, not semantic result shopping.
- CRITICAL/high-impact policy may require human approval.
- Workflow configurability cannot weaken system-policy invariants.
- Secrets/data egress are default-deny by policy.
- Telemetry/evals precede model-routing optimization.
