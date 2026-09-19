# FreeHighlander — Current Project State

**State status:** FH-06 COMPLETE / FH-01B2 BLOCKED  
**Canonical pointer:** `.freehighlander/state.yaml`

## Completed

- FH-00 planning foundation
- FH-01A executable TypeScript platform bootstrap
- FH-01B1 provisional V2 compatibility port
- FH-02 append-only telemetry event history
- FH-03 SQLite telemetry read model
- FH-04 read-only local observability dashboard
- FH-05 independent Qwen/local shadow evaluation framework
- FH-06 benchmark reconciliation and promotion-candidate reporting

FH-06 can aggregate only adjudicated real samples into quality/economics reports:

- agreement
- precision
- confirmed / false-positive / missed findings
- P0/P1 and P2 misses
- malformed candidate rate inputs
- candidate/reference latency p50/p95
- token totals
- cost totals
- projected cost-saving ratio

Screening outputs are limited to:

```text
INSUFFICIENT_DATA
BLOCKED
PROMOTION_CANDIDATE
HUMAN_POLICY_REQUIRED
```

There is deliberately no PROMOTED state.

## Promotion remains human/policy controlled

```text
promotionCanApplyAutomatically() = false
authorityGranted = false
```

No role is considered ready for promotion merely because FH-06 exists. Real benchmark samples are still
required: NORMAL >= 50 eligible samples and HIGH >= 100, with their respective quality floors.

## V2 authority remains blocked

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

FH-01B2 issue **#19** still requires Creator Marketplace #207 final acceptance, merge and smoke.

## Next unblocked work

FH-07 token/context optimization and its enabling contracts:

- context packet manifest
- prompt/contract hashes
- semantic reuse key
- token budgeting
- cache diagnostics

These optimizations must not reduce the strong-reviewer/full-evidence authority invariant.
