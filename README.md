# FreeHighlander Engineering Platform

> Fikir aşamasından production operasyonuna kadar yazılım yaşam döngüsünü; değiştirilebilir LLM rolleri, deterministik kapılar, insan otoritesi ve tam mühendislik izlenebilirliği ile yöneten AI destekli engineering platformu.

## Durum

Bu repository **FreeHighlander'ın ana ürün repository'sidir** ve ürün kodu ile planning/architecture/governance kontratlarını birlikte taşır.

20 Eylül 2026 itibarıyla:

- FH-00 ve FH-01A tamamlandı.
- FH-01B1 provisional V2 compatibility port tamamlandı; V2 reference hâlâ **PROVISIONAL**.
- FH-02..FH-19 implementation hattı tamamlandı.
- FH-20 cutover-readiness gate tamamlandı ancak final authority cutover **Creator Marketplace #207 / FH-01B2** tamamlanana kadar bloklu.
- FH-30A..FH-37A authority-neutral SDLC preparation lane tamamlandı.
- FH-30B..FH-37B authority-bearing activation lane FH-01B2/FH-20 sonrasına bloklu.
- Pre-cutover hardening hattında data policy, sandbox, retention, SQLite backup/restore, cross-module digital thread, privacy-safe observability, adversarial fail-closed coverage, workspace dependency boundaries, reproducible CI ve repository credential/dependency hygiene tamamlandı.

Current authority state:

```text
V2 reference = PROVISIONAL
V3 authority = SHADOW_ONLY
FH-20 cutover = BLOCKED
FH-30B..FH-37B = BLOCKED
```

External dependency:
- `skonyd/creator-marketplace#207`
- final acceptance + merge + post-merge smoke tamamlanmadan FH-01B2 reconciliation ve FH-20 authority cutover yapılamaz.

## Delivery state

Completed/prepared:

1. TypeScript monorepo + provisional V2 compatibility
2. Telemetry + SQLite + read-only dashboard
3. Qwen/local shadow benchmark and model economics
4. Token/context/provider resilience
5. V3 architecture/control-plane foundation through FH-19
6. FH-20 deterministic cutover-readiness gate
7. FH-30A..FH-37A read-only/authority-neutral SDLC bounded contexts
8. Pre-cutover security/persistence/integration hardening
9. Reproducible CI + repository credential/dependency hygiene

Remaining authority-bearing sequence:

```text
Creator Marketplace #207 final acceptance + merge + smoke
        ↓
FH-01B2 final V2 reconciliation/parity
        ↓
FH-20 authority cutover
        ↓
FH-30B..FH-37B activation
```

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
- [Backlog](BACKLOG.md)
- [V3 Architecture Contract](docs/architecture/V3-ARCHITECTURE-CONTRACT.md)
- [ADR Index](docs/decisions/README.md)
- [Lineage Schema](docs/architecture/LINEAGE-SCHEMA-v1.md)
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
