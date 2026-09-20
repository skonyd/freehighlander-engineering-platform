# FH-31A — Development module pre-cutover implementation

**Issue:** #72  
**PR:** #73  
**Status:** IN PROGRESS  
**Architecture contract:** 1.2.0  
**Authority effect:** NONE

## Objective

Represent implementation work and exact repository revisions as deterministic,
read-only/shadow state before V3 authority cutover.

## Domain model

A development task binds:
- stable task identity and revision;
- repository and exact base revision;
- implementation intent;
- acceptance-criterion identities;
- allowed repository-relative scope paths;
- blockers and optional supersession metadata.

A change candidate binds:
- task identity;
- repository plus exact base/head revisions;
- affected paths and change kind;
- implementation intent;
- result evidence bound to the exact head revision;
- shadow execution intents.

## Validation

FH-31A fails closed on:
- missing repository/revision identity;
- base/head equality;
- duplicate or empty identities;
- absolute/traversal repository paths;
- invalid rename metadata;
- evidence bound to another repository or revision;
- non-SHA256 evidence digests;
- shadow intents referencing unknown paths;
- task/candidate repository, base-revision or scope mismatch.

## Authority boundary

Shadow execution intents are data only:

```text
sideEffects = FORBIDDEN
authority = NONE
executionAuthorized = false
gitMutationAuthorized = false
mergeAuthorized = false
V3 authority = SHADOW_ONLY
```

No FH-31A code path executes commands, mutates Git or merges a pull request.

## Determinism

A canonical JSON representation of the change candidate is SHA-256 hashed into a
deterministic Development snapshot.

## Verification

```bash
npm run verify
```
