# ADR-0014 — Development bounded context pre-cutover contract

**Status:** ACCEPTED

## Context

FH-30A established the first authority-neutral module bounded context. The accepted
pre-cutover lane defines FH-31A as the Development module that represents
implementation work and exact repository revisions without granting write authority.

Development data must be useful to later Testing and Release modules while Creator
Marketplace #207 still blocks FH-01B2 and final FH-20 authority cutover.

## Decision

1. Introduce `packages/development` as a coherent bounded context.
2. Development tasks bind stable identity, repository, exact base revision, scope,
   intent, acceptance criteria and blockers.
3. Change candidates bind the task, repository, exact base/head revisions, affected
   paths, implementation intent, result evidence and shadow execution intents.
4. Result evidence is revision-bound and hash-identified.
5. Shadow execution intents are descriptive data only and require
   `sideEffects=FORBIDDEN` and `authority=NONE`.
6. Development readiness/projections cannot authorize command execution, Git
   mutation, PR merge, release, deployment or policy bypass.
7. Unknown, mismatched or out-of-scope bindings fail closed.

## Architecture contract effect

This is an additive semantic architecture change:

- contract version: `1.1.0 -> 1.2.0`
- accepted ADRs: add `ADR-0014`
- bounded contexts: add `development`

V3 authority remains `SHADOW_ONLY`.

## Consequences

- FH-32A Testing can bind evidence to exact development candidates;
- FH-34A Release can later consume exact source revisions without inheriting
  mutation authority;
- pre-cutover development planning remains safe to merge before FH-20;
- all authority-bearing Development activation remains in FH-31B after cutover.
