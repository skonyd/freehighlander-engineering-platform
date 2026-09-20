# PR Roadmap

**Status:** ACCEPTED DIRECTION / IMPLEMENTATION ADVANCED THROUGH PRE-CUTOVER A-LANE

FH kimlikleri çalışma paketidir; GitHub PR numarası değildir.

## Current execution state

- FH-01A complete.
- FH-01B1 provisional compatibility complete.
- FH-01B2 blocked by Creator Marketplace #207 final acceptance/merge/smoke.
- FH-02..FH-19 complete.
- FH-20 readiness gate complete; authority cutover blocked.
- FH-30A..FH-37A complete and authority-neutral.
- FH-30B..FH-37B remain post-cutover.
- Pre-cutover hardening through reproducible CI, repository hygiene, tracked-secret enforcement, 19/19 measured native coverage, opaque SecretHandle/EPHEMERAL injection, lockfile provenance and safe vulnerability-reporting guidance is complete.

```text
V2 reference = PROVISIONAL
V3 authority = SHADOW_ONLY
```

## Foundation / automation
- **FH-00** Planning foundation — complete
- **FH-01A** TypeScript monorepo/bootstrap — complete
- **FH-01B1** Provisional V2 compatibility — complete
- **FH-01B2** Accepted V2 reconciliation — blocked by #207
- **FH-02** Telemetry event schema + emitter — complete
- **FH-03** SQLite telemetry/state index — complete
- **FH-04** Read-only dashboard — complete

## Qwen / economics
- **FH-05** Qwen specialist shadow roles — complete
- **FH-06** Benchmark reconciliation + promotion reports — complete
- **FH-07** Token/context optimization — complete
- **FH-08** Provider health/quota/circuit-breaker telemetry — complete

## V3
- **FH-10** Architecture contract freeze — complete
- **FH-11** Provider adapters + binding registry — complete
- **FH-12** Role registry + role packages — complete
- **FH-13** Workflow DAG + explicit state machine — complete
- **FH-14** Debate/council + disagreement escalation — complete
- **FH-15** Policy-as-code + human approval — complete
- **FH-16** Artifact lineage + hashes — complete
- **FH-17** Replay/simulation + crash recovery — complete
- **FH-18** Management UI — complete
- **FH-19** V2/V3 shadow parity — complete
- **FH-20** V3 authority cutover — readiness complete, cutover blocked by FH-01B2/#207

## Modules

Each module has an authority-neutral **A** preparation lane and authority-bearing **B** activation lane.

- **FH-30A..FH-37A** — complete
- **FH-30B..FH-37B** — blocked until final FH-20 authority cutover

Canonical split and authority boundaries: [FH-30-37-PRECUTOVER.md](FH-30-37-PRECUTOVER.md).

## FH-01 status

FH-01 did not remain blocked as a whole. The work was split:

```text
FH-01A platform bootstrap                         COMPLETE
FH-01B1 provisional V2 compatibility             COMPLETE
FH-01B2 final accepted-V2 reconciliation         BLOCKED BY #207
```

The provisional reference SHA cannot be promoted to final accepted authority evidence without Creator Marketplace #207 completion.

## Dependency spine — current

```text
FH-00 → FH-01A/FH-01B1 → FH-02..FH-19 → FH-20 readiness
                                      │
                                      ├──→ FH-30A..FH-37A COMPLETE
                                      │
                                      └──→ pre-cutover hardening COMPLETE
Creator Marketplace #207
        ↓
FH-01B2 final reconciliation
        ↓
FH-20 final authority cutover
        ↓
FH-30B..FH-37B activation
```

This ordering preserves the distinction between preparation/readiness evidence and authority-bearing activation.
