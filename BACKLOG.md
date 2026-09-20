# Backlog

Backlog, [PR Roadmap](docs/planning/PR-ROADMAP.md) ile birlikte okunmalıdır.

## Foundation
- [x] FH-00 Planning foundation ve doküman sözleşmesi
- [x] FH-01A Platform bootstrap — issue #15 / PR #17
- [ ] FH-01B umbrella — issue #16
  - [x] FH-01B1 Provisional V2 compatibility, authority disabled — issue #18 / PR #21
  - [ ] FH-01B2 Accepted V2 reconciliation + authority promotion — issue #19, blocked by Creator Marketplace #207
- [x] FH-02 Telemetry event emitter / durable event history — issue #22 / PR #23
- [x] FH-03 SQLite run/event/artifact metadata store — issue #24 / PR #25
- [x] FH-04 Read-only metrics dashboard — issue #26 / PR #27

## FH-01/FH-02 enabling contracts
- [x] Context packet builder + manifest validation — FH-07 / PR #33
- [x] Prompt contract/version registry — FH-07 / PR #33
- [x] Semantic model-call reuse key — FH-07 / PR #33
- [x] Evidence policy validator — issue #61 / PR #62
- [x] Provider token-count capability contract/preflight — FH-07 / PR #33
- [x] Token-budget diagnostics — FH-07 / PR #33
- [x] canonical project checkpoint / remote reconciliation — issue #10 / PR #60
- [x] token/cache/context packet tooling — issue #11 / PR #33

## Qwen / model economics
- [x] FH-05 Qwen specialist shadow roles — issue #29 / PR #30
- [x] FH-06 Benchmark reconciliation + role promotion reports — issue #31 / PR #32
- [x] FH-07 Token/context optimization — issue #11 / PR #33
- [x] FH-08 Provider health / quota / circuit-breaker telemetry — issue #36 / PR #37

## V3 control plane
- [x] FH-10 V3 architecture contract freeze — issue #38 / PR #39
- [x] FH-11 Provider adapter implementations + binding registry — issue #40 / PR #42
- [x] FH-12 Role registry + role packages — issue #43 / PR #44
- [x] FH-13 Workflow DAG + explicit state machine — issue #45 / PR #46
- [x] FH-14 Debate/council + disagreement escalation — issue #47 / PR #48
- [x] FH-15 Human approval + policy-as-code — issue #49 / PR #50
- [x] FH-16 Artifact lineage + hashes — issue #52 / PR #53
- [x] FH-17 Replay/simulation + crash recovery — issue #54 / PR #55
- [x] FH-18 UI control plane — issue #56 / PR #57
- [x] FH-19 V2/V3 shadow dual-run + parity — issue #58 / PR #59
- [ ] FH-20 V3 authority cutover + legacy shell retirement plan — readiness gate complete via issue #64 / PR #65; cutover blocked by Creator Marketplace #207


## Modules — pre-cutover preparation lane
- [x] FH-30A Planning module contracts/read-only preparation — issue #69 / PR #70
- [x] FH-31A Development module contracts/shadow preparation — issue #72 / PR #73
- [x] FH-32A Testing module evidence/read-only preparation — issue #75 / PR #76
- [x] FH-33A Security module evidence/read-only preparation — issue #78 / PR #79 — issue #78 / PR #79 active
- [x] FH-34A Release module readiness/read-only preparation — issue #80 / PR #81
- [x] FH-35A Operations module inventory/health/read-only preparation — issue #82
- [x] FH-36A Incident module lifecycle/read-only preparation — issue #84
- [x] FH-37A Project knowledge graph / engineering lineage preparation — issue #86

Activation lane FH-30B..FH-37B remains blocked by FH-01B2/FH-20 final authority cutover.


## Pre-cutover hardening — independent of Creator Marketplace #207
- [x] Executable data-policy/redaction/provider-egress enforcement — issue #89 / PR #90
- [x] Executable sandbox permission evaluator — issue #91 / PR #92
- [x] Retention/privacy lifecycle — issue #93 / PR #94
- [ ] SQLite backup/restore/integrity hardening — issue #95
- [ ] FH-30A..FH-37A cross-module read-only integration
- [ ] Hardening observability + adversarial/fail-closed tests
- [ ] Architecture dependency-boundary enforcement
- [ ] Roadmap/documentation drift cleanup

Umbrella: #88. This lane must not enable V3 authority or assume final #207 behavior.
