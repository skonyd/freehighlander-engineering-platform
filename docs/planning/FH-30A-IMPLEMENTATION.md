# FH-30A — Planning module pre-cutover implementation

**Issue:** #69  
**Status:** COMPLETE  
**Architecture contract:** 1.1.0  
**Authority effect:** NONE

## Objective

Introduce a dedicated Planning bounded context for deterministic engineering-plan
state before V3 authority cutover.

## Domain model

A plan binds:
- stable plan identity;
- monotonic revision;
- repository identity;
- exact base revision;
- acceptance criteria;
- work items and dependency edges;
- explicit blockers;
- optional supersession metadata.

Planning statuses:

```text
DRAFT
READY
BLOCKED
SUPERSEDED
```

These statuses are planning-domain state only.

## Validation

The module fails closed on:
- missing repository/base-revision identity;
- duplicate acceptance/work-item/blocker identities;
- unknown dependencies;
- self-dependencies;
- dependency cycles;
- unknown acceptance-criterion references;
- BLOCKED without an explicit blocker;
- READY while blockers remain;
- READY without acceptance criteria or work items;
- invalid supersession revision metadata.

## Snapshot

A deterministic snapshot contains a canonical SHA-256 plan hash and a read-only
projection.

The projection always records:

```text
authority = NONE
executionAuthorized = false
```

## Invariants

```text
planning READY != authority
planning READY != execution
planning READY != merge
planning READY != release/deploy
V3 authority = SHADOW_ONLY
```

## Architecture evolution

ADR-0013 adds `packages/planning` as a coherent bounded context and bumps the
machine-readable architecture contract from 1.0.0 to 1.1.0.

## Verification

```bash
npm run verify
```
