# FreeHighlander — Current Project State

**State status:** FH-08 IN PROGRESS / FH-01B2 BLOCKED  
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
- FH-07 token/context optimization foundation

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

## FH-07 completed

Issue **#11** was implemented through PR **#33** and merged as:

```text
b1698795b6a2ce529a1886d02cd5181c12f217bf
```

Delivered:
- deterministic context packet manifests and semantic reuse identity;
- stale-context trimming that preserves gate-required evidence;
- provider-aware token-budget preflight without guessed token counts;
- stable prompt-prefix assembly and cache identity;
- executable token-policy/context-profile loading and validation;
- cache/reuse telemetry metadata and diagnostics;
- architecture guards that prevent authority changes or required-evidence removal;
- required-status-check naming aligned with the `main-protection` ruleset.

Hard invariant remains:

```text
token/context optimization != authority reduction
cache/reuse != correctness evidence
```

## FH-08 active work

Issue **#36** is active on branch `feat/fh-08-provider-resilience`.

Current implementation adds deterministic availability-only circuit breaking, quota/rate cooldown handling, provider health snapshots and resilience telemetry. Semantic or malformed model output never trips the availability circuit and never enables semantic fallback/model-shopping.

Hard invariant:

```text
provider resilience != authority change
semantic failure != availability failure
```

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

## Next action

Complete FH-08 verification/merge, then advance automatically to FH-10 V3 architecture contract freeze while FH-01B2 remains blocked by Creator Marketplace #207.
