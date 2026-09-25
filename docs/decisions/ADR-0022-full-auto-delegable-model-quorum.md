# ADR-0022 — Delegable dual-model quorum without human impersonation

**Status:** ACCEPTED

## Context

Some operator confirmation gates are intentionally conservative but may be explicitly delegated to two independent model reviewers when deterministic policy permits. Existing `HUMAN_REQUIRED` semantics are non-delegable and must not be weakened or reinterpreted as model consensus.

Full Auto therefore needs a distinct policy state instead of treating a model as `HUMAN_APPROVER`.

## Decision

Introduce `MODEL_QUORUM_REQUIRED` as a distinct delegable policy effect.

Policy precedence is:

```text
ALLOW < MODEL_QUORUM_REQUIRED < HUMAN_REQUIRED < DENY
```

A model quorum is evidence only. It does not grant authority and cannot directly issue a merge/release/deploy command. Deterministic `SYSTEM_POLICY` must validate the exact-bound quorum and all other mandatory evidence before it may create a merge intent.

`HUMAN_REQUIRED` remains non-delegable. `DENY` remains final. Neither can be satisfied or overridden by any model quorum.

Full Auto profiles are `OFF`, `SAFE`, `BALANCED`, and `CUSTOM`; the default is `OFF`.

## Exact-bound requirements

A quorum protocol must bind both reviewers to the same immutable repository/revision/run/scope/policy/evidence and binding snapshots. Reviewers must be independent logical roles and must not be the producer of the reviewed revision.

Round zero remains independent. Optional disagreement handling is bounded. Autonomous merge candidacy requires unanimous `APPROVE`; disagreement, missing/stale evidence, invalid independence, containment failure, change-budget failure, `HUMAN_REQUIRED`, or `DENY` fails closed.

## Authority boundary

```text
model verdict != HUMAN_APPROVER
model consensus != SYSTEM_POLICY
quorum artifact != merge authority
MODEL_QUORUM_REQUIRED != HUMAN_REQUIRED
```

Until FH-20, V3 execution authority remains `SHADOW_ONLY`. This ADR permits contract and shadow evaluation work only; it does not activate merge authority.

## Consequences

- policy rules can distinguish delegable operator confirmation from true human-only gates;
- existing human approval request/decision contracts remain unchanged;
- future reviewer providers/models can participate through dynamic role/binding qualification rather than hard-coded model names;
- Full Auto implementation must preserve reviewer independence, exact binding, bounded loops, runtime containment, change budgets, and final remote-head revalidation.

## Alternatives rejected

- treating model consensus as `HUMAN_APPROVER`;
- weakening `HUMAN_REQUIRED`;
- majority vote with reviewer dissent;
- allowing models to override `DENY`;
- enabling merge authority before the accepted cutover path.

## Affected work

- #147 Full Auto Mode
- #145 dynamic model catalog/binding management
- #144 parallel orchestration/provenance
- #146 runtime preflight/stability
- #148 execution containment
- FH-20 authority cutover

