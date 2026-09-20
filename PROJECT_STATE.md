# FreeHighlander — Current Project State

**State status:** PRE-CUTOVER PREPARATION COMPLETE / FH-01B2 + FH-20 CUTOVER BLOCKED  
**Canonical pointer:** `.freehighlander/state.yaml`  
**Architecture contract:** 1.8.0

## Authority snapshot

```text
V2 reference = PROVISIONAL
V2 authority promotion = BLOCKED
V3 authority = SHADOW_ONLY
FH-20 cutover = BLOCKED
FH-30B..FH-37B activation = BLOCKED
```

The external blocker is `skonyd/creator-marketplace#207`. Final acceptance, merge and post-merge smoke are required before FH-01B2 can reconcile the provisional V2 port against the final accepted reference.

## Completed platform foundation

- FH-00 planning foundation
- FH-01A TypeScript platform bootstrap
- FH-01B1 provisional V2 compatibility port
- FH-02 append-only telemetry
- FH-03 SQLite state/read model
- FH-04 read-only dashboard
- FH-05/FH-06 Qwen shadow benchmark + reconciliation
- FH-07 token/context optimization
- FH-08 provider health/quota/circuit breaker
- FH-10 architecture freeze
- FH-11 provider adapters/bindings
- FH-12 logical role registry/packages
- FH-13 workflow DAG/state machine
- FH-14 debate/council
- FH-15 policy-as-code + human approval
- FH-16 artifact lineage
- FH-17 replay/recovery
- FH-18 management UI
- FH-19 V2/V3 shadow parity
- FH-20 deterministic cutover-readiness evaluator

FH-20 readiness evidence exists; readiness does not itself grant authority.

## Completed authority-neutral SDLC A-lane

| Work item | Issue / PR | Merge SHA | Contract |
| --- | --- | --- | --- |
| FH-30A Planning | #69 / #70 | `6136d736f1db7ca7e121c497f9a99bdc8d2894e9` | 1.1.0 |
| FH-31A Development | #72 / #73 | `2e713fdc4cd3472aeb7d10d08121499f7c2d425e` | 1.2.0 |
| FH-32A Testing | #75 / #76 | `2f8e04d7be3928e42312654056ac2474837bf505` | 1.3.0 |
| FH-33A Security | #78 / #79 | `702df5a77b989b28cec87d81da5a5e53b801e2a2` | 1.4.0 |
| FH-34A Release | #80 / #81 | `654b55a7ee0020d76d07aaf68e5623b17d710541` | 1.5.0 |
| FH-35A Operations | #82 / #83 | `0ba195ba63c104a85b78d3b4ae43dc819459eb06` | 1.6.0 |
| FH-36A Incident | #84 / #85 | `b4250db148537af31ce8d3812890f51f45da447f` | 1.7.0 |
| FH-37A Engineering Lineage | #86 / #87 | `7fa533eeb92b540892375fe64fd46cf027c46c7f` | 1.8.0 |

All A-lane outputs remain evidence/readiness/domain state only. They do not authorize merge, release, deployment, infrastructure mutation or automatic remediation.

## Completed pre-cutover hardening

- #89 / PR #90 — executable data-policy, redaction and provider-egress enforcement
- #91 / PR #92 — executable sandbox permission evaluator
- #93 / PR #94 — retention/privacy dry-run lifecycle
- #95 / PR #96 — verified SQLite backup/restore/integrity
- #97 / PR #99 — FH-30A..FH-37A cross-module read-only digital thread
- #100 / PR #101 — privacy-safe hardening observability
- #102 / PR #103 — deterministic adversarial/fail-closed test matrix
- #105 / PR #106 — workspace dependency-boundary enforcement
- #109 / PR #110 — reproducible CI: lockfile, npm ci, immutable Action SHAs and pinned runner family
- #111 / PR #112 — checkout credential isolation, bounded Dependabot updates and reconciled CODEOWNERS
- #114 / PR #117 — deterministic git-tracked secret leakage gate
- #118 / PR #119 — reviewed current-main refresh to pinned checkout v7.0.1 and setup-node v7.0.0; Node type majors remain aligned to Node 24 runtime
- #120 / PR #121 — Node 24 native per-workspace coverage regression floors from measured baseline
- #122 / PR #123 — control-plane contract tests; coverage inventory is now 19/19 workspaces with no untested exception
- #124 / PR #125 — opaque SecretHandle + fail-closed EPHEMERAL injection contract; real credential backend resolution remains intentionally unimplemented
- #126 / PR #127 — deterministic npm lockfile provenance/integrity/install-script gate

Hardening does not change authority. Dependency update PRs remain review-only and do not gain merge authority.

## What remains blocked

### FH-01B2 — issue #19

After Creator Marketplace #207 completes:
1. record final accepted reference SHA;
2. compare it with provisional reference SHA `0e70f4a9680fcc5c287b7926f2aa20170c79f47d`;
3. port/reconcile any exact delta;
4. rerun parity/regression;
5. verify authority/provenance/fail-closed invariants;
6. run post-port smoke.

### FH-20 final cutover

Only after FH-01B2 and the existing readiness requirements are satisfied:
- verify final-reference-bound parity;
- verify explicit human approval;
- verify system policy ALLOW;
- perform explicit authority-promotion review.

### FH-30B..FH-37B

Authority-bearing module activation is post-cutover only.

## Next action

No currently planned authority-bearing step is safe without Creator Marketplace #207.

Until that external dependency clears:
- keep V2 reference `PROVISIONAL`;
- keep V3 authority `SHADOW_ONLY`;
- do not activate FH-30B..FH-37B;
- use `npm run verify` for repository integrity;
- revalidate GitHub state before resuming any authority migration.

## Canonical sources

Precedence remains:
1. accepted ADRs;
2. `.freehighlander/state.yaml`;
3. this file;
4. active GitHub issue/PR;
5. `docs/planning/PR-ROADMAP.md`;
6. `BACKLOG.md`.
