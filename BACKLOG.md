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
- [ ] Evidence policy validator
- [x] Provider token-count capability contract/preflight — FH-07 / PR #33
- [x] Token-budget diagnostics — FH-07 / PR #33
- [ ] canonical project checkpoint / remote reconciliation — issue #10
- [x] token/cache/context packet tooling — issue #11 / PR #33

## Qwen / model economics
- [x] FH-05 Qwen specialist shadow roles — issue #29 / PR #30
- [x] FH-06 Benchmark reconciliation + role promotion reports — issue #31 / PR #32
- [x] FH-07 Token/context optimization — issue #11 / PR #33
- [x] FH-08 Provider health / quota / circuit-breaker telemetry — issue #36 / PR #37

## V3 control plane
- [x] FH-10 V3 architecture contract freeze — issue #38 / PR #39
- [x] FH-11 Provider adapter implementations + binding registry — issue #40 / PR #42
- [ ] FH-12 Role registry + role packages
- [ ] FH-13 Workflow DAG + explicit state machine
- [ ] FH-14 Debate/council + disagreement escalation
- [ ] FH-15 Human approval + policy-as-code
- [ ] FH-16 Artifact lineage + hashes
- [ ] FH-17 Replay/simulation + crash recovery
- [ ] FH-18 UI control plane
- [ ] FH-19 V2/V3 shadow dual-run + parity
- [ ] FH-20 V3 authority cutover + legacy shell retirement plan
