# FreeHighlander Engineering Platform

> Fikir aşamasından production operasyonuna kadar yazılım yaşam döngüsünü; değiştirilebilir LLM rolleri, deterministik kapılar, insan otoritesi ve tam mühendislik izlenebilirliği ile yöneten AI destekli engineering platformu.

## Durum

Bu repository **FreeHighlander'ın ana ürün repository'sidir** ve ürün kodu ile planning/architecture/governance kontratlarını birlikte taşır.

25 Eylül 2026 itibarıyla:

- FH-00 ve FH-01A tamamlandı.
- FH-01B1 provisional port ve FH-01B2 final reconciliation tamamlandı; V2 reference **ACCEPTED**.
- FH-02..FH-19 implementation hattı tamamlandı.
- FH-20 cutover-readiness gate tamamlandı; Creator Marketplace #207/FH-01B2 external blocker temizlendi. Final V3 cutover hâlâ explicit human approval + SYSTEM_POLICY=ALLOW + promotion review gerektiriyor.
- FH-30A..FH-37A authority-neutral SDLC preparation lane tamamlandı.
- FH-30B..FH-37B authority-bearing activation lane FH-20 final cutover sonrasına bloklu.
- Pre-cutover hardening hattında data policy, sandbox, retention, SQLite backup/restore, cross-module digital thread, privacy-safe observability, adversarial fail-closed coverage, workspace dependency boundaries, reproducible CI, repository credential/dependency hygiene, tracked-secret leakage gate, 19/19 workspace için ölçülmüş native coverage regression gate ve opaque SecretHandle/EPHEMERAL injection kontratı ve npm lockfile provenance/integrity/install-script gate ve güvenli private vulnerability reporting policy ve deterministic clean-build output integrity gate ve monorepo accidental-publish safety gate ile internal workspace dependency-confusion gate ve workspace package entrypoint integrity gate ve source-to-dist build completeness gate tamamlandı.

Current authority state:

```text
V2 reference = ACCEPTED
V2 compatibility authority = ENABLED
V3 authority = SHADOW_ONLY
FH-20 external blocker = CLEARED
FH-20 cutover = NOT YET APPLIED
FH-30B..FH-37B = BLOCKED BY FH-20
```

Accepted external reference:
- `skonyd/creator-marketplace#207` merged at `e4707a3c4267db9d2aadd452782b91045b96724d`
- direct hardening #209 produced final accepted reference `1a8e215b78a3a5008aae6aae36488b3273733b19`
- FreeHighlander FH-01B2 reconciliation merged in PR #237; full verify run `36159166117` passed.

## Delivery state

Completed/prepared:

1. TypeScript monorepo + accepted V2 compatibility
2. Telemetry + SQLite + read-only dashboard
3. Qwen/local shadow benchmark and model economics
4. Token/context/provider resilience
5. V3 architecture/control-plane foundation through FH-19
6. FH-20 deterministic cutover-readiness gate
7. FH-30A..FH-37A read-only/authority-neutral SDLC bounded contexts
8. Pre-cutover security/persistence/integration hardening
9. Reproducible CI + repository credential/dependency hygiene
10. Native Node test coverage regression enforcement (19/19 workspaces)
11. Opaque SecretHandle + EPHEMERAL injection governance contract
12. Deterministic lockfile provenance/integrity/install-script enforcement
13. Byte-for-byte deterministic clean-build output integrity
14. Monorepo accidental-publish safety (19/19 private pre-release workspaces)
15. Internal workspace dependency-confusion prevention
16. Workspace package entrypoint integrity enforcement
17. Source-to-dist build completeness enforcement

Remaining authority-bearing sequence:

```text
FH-20 exact human approval + SYSTEM_POLICY ALLOW + promotion review
        ↓
FH-20 V3 authority cutover
        ↓
FH-30B..FH-37B activation
```

Creator Marketplace #207 and FH-01B2 are complete and are no longer blockers.

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
