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
- [ ] Context packet builder + manifest validation
- [ ] Prompt contract/version registry
- [ ] Semantic model-call reuse key
- [ ] Evidence policy validator
- [ ] Provider token-count capability implementation
- [ ] Token-budget diagnostics
- [ ] canonical project checkpoint / remote reconciliation — issue #10
- [ ] token/cache/context packet tooling — issue #11

## Qwen / model economics
- [x] FH-05 Qwen specialist shadow roles — issue #29 / PR #30
- [ ] FH-06 Benchmark reconciliation + role promotion reports — issue #31
- [ ] FH-07 Token/context optimization
- [ ] FH-08 Provider health / quota / circuit-breaker telemetry

## V3 control plane
- [ ] FH-10 V3 architecture contract freeze
- [ ] FH-11 Provider adapter implementations + binding registry
- [ ] FH-12 Role registry + role packages
- [ ] FH-13 Workflow DAG + explicit state machine
- [ ] FH-14 Debate/council + disagreement escalation
- [ ] FH-15 Human approval + policy-as-code
- [ ] FH-16 Artifact lineage + prompt/contract/workflow hashes
- [ ] FH-17 Replay/simulation + crash recovery
- [ ] FH-18 UI control plane
- [ ] FH-19 V2/V3 shadow dual-run + parity
- [ ] FH-20 V3 authority cutover + legacy shell retirement plan
