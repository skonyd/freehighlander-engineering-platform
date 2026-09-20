# ADR-0013 — Module bounded contexts and pre-cutover preparation

**Status:** ACCEPTED

## Context

The V3 foundation now has stable orchestration, governance, evidence, telemetry,
persistence, evaluation and cutover-readiness contracts. The product roadmap also
defines domain modules for Planning, Development, Testing, Security, Release,
Operations, Incident and engineering lineage.

ADR-0012 deliberately deferred package creation until a module owned a coherent
capability and dependency boundary. FH-30A reaches that threshold for Planning.

Creator Marketplace #207 still blocks accepted V2 reconciliation and final V3
authority cutover. That blocker applies to authority-bearing activation, not to
authority-neutral module contracts and read-only/shadow behavior.

## Decision

1. Module bounded contexts may be introduced incrementally as coherent packages.
2. FH-30A introduces `packages/planning` as the first module package.
3. Pre-cutover module packages must remain authority-neutral and must not authorize
   execution, merge, deployment, remediation or policy bypass.
4. Module readiness is domain state only. It is never authority.
5. Post-cutover activation remains gated by FH-20 governance/policy/human approval.
6. Later FH-31A..FH-37A packages may be added under the same rule when each reaches
   a coherent capability boundary.

## Architecture contract effect

This is an additive semantic change to the frozen architecture baseline.

- contract version: `1.0.0 -> 1.1.0`
- accepted ADRs: add `ADR-0013`
- bounded contexts: add `planning`

The minor version bump reflects an additive bounded-context capability with no
removal or weakening of existing contracts.

## Consequences

- module work can progress while #207 remains unresolved;
- V3 authority remains `SHADOW_ONLY`;
- planning data can be versioned and queried before authoritative execution;
- package proliferation remains controlled by the ADR-0012 coherent-boundary rule;
- FH-20 remains the sole authority activation boundary.
