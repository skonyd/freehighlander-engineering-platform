# FreeHighlander — Current Project State

**State status:** FH-19 COMPLETE / EVIDENCE POLICY COMPLETE / FH-01B2 BLOCKED  
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
- FH-08 provider health/quota/circuit-breaker telemetry
- FH-11 provider adapters and binding registry
- FH-12 logical role registry and immutable role packages

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

## FH-08 completed

Issue **#36** is implemented through PR **#37**.

Current implementation adds deterministic availability-only circuit breaking, quota/rate cooldown handling, provider health snapshots and resilience telemetry. Semantic or malformed model output never trips the availability circuit and never enables semantic fallback/model-shopping.

Hard invariant:

```text
provider resilience != authority change
semantic failure != availability failure
```

## FH-10 completed

Issue **#38** / PR **#39** freezes the accepted ADR baseline into `.freehighlander/architecture.yaml`.

The contract pins platform boundaries, authority, provider fallback, role/workflow versioning, evidence, telemetry, security, evaluation and migration semantics. V3 authority remains `SHADOW_ONLY` until FH-20.

Architecture drift is now validated by `project:doctor` and deterministic tests.

## Promotion remains human/policy controlled

```text
promotionCanApplyAutomatically() = false
authorityGranted = false
```

No role is considered ready for promotion merely because FH-06 exists. Real benchmark samples are still
required: NORMAL >= 50 eligible samples and HIGH >= 100, with their respective quality floors.

## FH-11 completed

Provider and versioned model-binding resolution is now deterministic and authority-neutral:

- duplicate and unknown registrations fail closed;
- capability, risk-tier and independence constraints are enforced before selection;
- ordered fallback is availability-only;
- semantic/malformed failures cannot model-shop;
- identical binding inputs produce a stable plan hash;
- binding configuration cannot grant authority.

## FH-12 completed

Logical role packages are now YAML-backed, semantically versioned and immutable by exact `id@version`.

- manifest authority is bounded by registration policy;
- model principals cannot self-grant human/system authority;
- unknown tool/action permission defaults to DENY;
- explicit forbidden actions win;
- exact-version snapshots have deterministic hashes;
- risk-tier and independence requirements are preserved.

## V2 authority remains blocked

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

FH-01B2 issue **#19** still requires Creator Marketplace #207 final acceptance, merge and smoke.

## FH-13 completed

Issue **#45** is implemented through PR **#46**.

The implementation adds:
- immutable semantic-versioned workflow DAG publication;
- deterministic workflow hashing;
- explicit bounded LOOP validation;
- fail-closed edge/duplicate/cycle validation;
- explicit node states and legal transitions;
- deterministic readiness and block propagation;
- run snapshots binding workflow/role/policy/binding/provider capability identity.

Authority remains unchanged and V3 remains `SHADOW_ONLY`.

## FH-14 completed

Issue **#47** is implemented through PR **#48**.

The implementation adds bounded council rounds, strict round-zero independence, deterministic consensus/disagreement evaluation and human escalation when bounded disagreement remains unresolved.

Consensus is advisory only:

```text
consensus != authority
unresolved final-round disagreement => HUMAN_REQUIRED
```

## FH-15 completed

Issue **#49** was implemented through PR **#50**.

Policy evaluation is deterministic and fail-closed:
- no match => DENY;
- precedence: DENY > HUMAN_REQUIRED > ALLOW;
- human requests bind exact policy/run/revision/action/risk/evidence identity;
- only HUMAN principals may record approval/denial;
- request mismatch/replay does not verify.

## FH-16 completed

Issue **#52** was implemented through PR **#53** and merged as `50ec6776e95532167567e1022f03d071dd1fdb41`.

Delivered deterministic hash-bound artifact envelopes, exact semantic binding, parent lineage, tamper checks and fail-closed missing-parent/cycle verification. Lineage remains authority-neutral.

## FH-17 completed

Issue **#54** was implemented through PR **#55** and merged as `142cee242af367b0b4b5f94741d7b3532533b29a`.

Replay/simulation now binds exact revision, workflow, snapshot, policy and artifact roots. Recovery checkpoints are tamper checked and replay-manifest bound; divergence is explicit and neither replay nor simulation grants authority.

## FH-18 completed

Issue **#56** was implemented through PR **#57** and merged as `722a7137930e37167ab93e7cab4d763226ee5984`.

The web layer remains client-only. Management snapshots expose runs, human-required events, artifacts and model calls. Management actions remain explicit control-plane-required intents; web cannot execute them or self-approve human gates.

## FH-19 completed

Issue **#58** was implemented through PR **#59** and merged as `102e508288c3caa76e59008ed0cfdd425056ccdb`.

Parity evidence now compares V2 and V3 shadow observations across route, gate, artifact, state, failure and outcome dimensions with exact revision/workflow/policy/artifact/input binding.

Hard invariant remains:

```text
parity PASS != authority
parity PASS != cutover
missing evidence != parity
```

V2 remains PROVISIONAL and V3 remains SHADOW_ONLY.

## Project-state tooling completed

Issue **#10** was implemented through PR **#60** and merged as `b46ae26f18de50a5c6182e2147c7441c4728069f`.

Resume/checkpoint tooling now validates remote branch and PR pointers, detects stale state, rejects unsafe checkpoint paths, writes explicit handoff history only on feature branches and verifies the pushed remote SHA. Checkpoints never infer semantic gate PASS.

## Evidence policy completed

Issue **#61** was implemented through PR **#62** and merged as `790093f17dad16344b0541e86675b7f2576b7676`.

The validator now enforces required evidence IDs/kinds, exact revision binding, trusted provenance and authoritative relation verification. Summary evidence cannot substitute required raw/diff/test/relation evidence, and token budget cannot authorize removal of required evidence.

Hard invariant:

```text
evidence validation != authority grant
summary != required raw evidence
token budget != permission to remove required evidence
```

## FH-20 cutover readiness complete

Issue **#64** was implemented through PR **#65** and merged as `1193d572ff2c0323a79ea2b44eac3df2ccfaebaf`.

The readiness gate requires:
- final V2 reference status = ACCEPTED;
- final accepted reference SHA recorded;
- parity evidence bound to that exact SHA;
- provisional-to-final delta reviewed;
- parity suite PASS;
- post-port smoke PASS;
- explicit authority-promotion review;
- exact human approval verification;
- system policy ALLOW.

The readiness evaluator never enables authority itself. Until all prerequisites are present:

```text
FH-20 readiness = BLOCKED
V3 authority = SHADOW_ONLY
```

## Next action

No further authority-bearing migration step is safe until Creator Marketplace #207 is accepted and merged. When that dependency clears: record the final accepted V2 SHA, review the provisional-to-final delta, rerun parity and smoke, verify exact human approval + system policy ALLOW, then execute FH-01B2/FH-20 cutover.


## Pre-cutover module lane

Issue **#67** / PR **#68** split FH-30..FH-37 into authority-neutral preparation
(A) and post-cutover activation (B). The A-lane may proceed while Creator
Marketplace #207 blocks FH-01B2/FH-20.

## FH-30A completed

Issue **#69** was implemented through PR **#70** and merged as `6136d736f1db7ca7e121c497f9a99bdc8d2894e9`.

The Planning bounded context is governed by ADR-0013 and architecture contract 1.1.0.

Planning owns versioned engineering plans, acceptance criteria, work-item
dependencies, blockers/readiness and exact repository/base-revision binding.

Hard invariant:

```text
planning READY != execution authority
planning READY != merge/release/deploy authority
V3 authority remains SHADOW_ONLY
```


## Next authority-neutral module work

With FH-30A complete, these A-lane packages remain available without Creator
Marketplace #207:

- FH-31A Development;
- FH-32A Testing (after Development contracts);
- FH-33A Security;
- FH-34A Release readiness (after Development/Testing/Security inputs);
- FH-35A Operations;
- FH-36A Incident (after Operations contract);
- FH-37A engineering lineage / knowledge graph.

Only B-lane activation remains blocked by FH-01B2/FH-20.
