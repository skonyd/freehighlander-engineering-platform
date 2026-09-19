# Coding Entry Gate

**Status:** READY / BLOCKED BY EXTERNAL DEPENDENCY

Bu doküman FH-00 planning aşamasından ilk gerçek implementation PR'ı olan FH-01'e geçiş kapısıdır.

## FH-00 planning gate

Aşağıdakiler tamamlandı:

- product charter / scope / non-goals
- requirements + NFR
- risk register
- ADR-0001..ADR-0012
- provider / fallback contract
- logical role / authority model
- workflow/debate model
- sandbox/privacy/retention
- engineering lineage model
- benchmark/promotion/budget policy
- local identity / remote-auth boundary
- backup/restore direction
- plugin/MCP boundary
- V2.5 telemetry/dashboard/Qwen plan
- V3 migration strategy
- FH-01 implementation plan
- repository-native checkpoint/resume conventions
- comprehensive FH-00 consistency audit

## Hard external dependency

FH-01 **başlatılmaz** until `skonyd/creator-marketplace#207` completes all of:

1. Sonnet candidate adjudication
2. Astra final review
3. HUMAN REQUIRED / human decision
4. merge
5. post-merge smoke

Partial acceptance V2 reference olarak kullanılmaz.

## Before first code commit

FH-01 branch açılmadan hemen önce:

- [ ] FreeHighlander FH-00 planning PR merged
- [ ] Creator Marketplace #207 merged
- [ ] #207 post-merge smoke PASS
- [ ] final accepted V2 reference SHA recorded
- [ ] fresh clone / clean worktree
- [ ] Node LTS, package manager and TypeScript exact versions pinned
- [ ] initial CI command contract decided
- [ ] repo-specific risk/deny paths defined
- [ ] no Marketplace application/domain assumptions copied
- [ ] issue #12 scope revalidated against current ADRs
- [ ] implementation branch created from current `main`

## FH-01 first-code scope

First implementation PR is intentionally foundation-only:

- TypeScript monorepo bootstrap
- bounded-context package skeleton
- V2 automation adaptation
- bootstrap / doctor / resume / checkpoint executable tooling
- state/schema validation
- provider/role/policy/evidence interfaces
- initial CI/regression harness

Not included:

- dashboard
- native V3 DAG/debate engine
- Planning/Security/Incident modules
- autonomous merge authority
- graph database
- enterprise multi-user auth

## Stop condition

Bu checklist tamamlandığında planning aşaması kapanır ve sonraki işlem **kod yazmaktır**.

Bu nedenle bu gate'ten sonra yeni planning scope'u ancak:
- gerçek implementation blocker,
- yeni requirement,
- architecture contradiction,
- veya explicit product decision

ortaya çıkarsa açılır.
