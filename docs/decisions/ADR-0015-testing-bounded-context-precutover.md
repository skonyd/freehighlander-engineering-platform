# ADR-0015 — Testing bounded context pre-cutover contract

**Status:** ACCEPTED

## Context

FH-31A established exact repository/base/head revision bindings for implementation
candidates. FH-32A needs deterministic test planning, result evidence and coverage
semantics that can consume those exact revisions without turning test outcomes into
authority decisions.

## Decision

1. Introduce `packages/testing` as an authority-neutral bounded context.
2. Test plans bind a development-candidate identity, repository, exact revision,
   exact environment fingerprint, required acceptance criteria and test cases.
3. Required acceptance criteria must have required test-case coverage.
4. Test results bind to the exact repository, revision and environment fingerprint.
5. Non-skipped results require digest-bound evidence.
6. Missing required results or passing coverage produce only a shadow gate state.
7. Test PASS cannot authorize merge, release, deployment or authority promotion.
8. Unknown, mismatched or malformed evidence fails closed.

## Architecture contract effect

This is an additive semantic architecture change:

- contract version: `1.2.0 -> 1.3.0`
- accepted ADRs: add `ADR-0015`
- bounded contexts: add `testing`

V3 authority remains `SHADOW_ONLY`.

## Consequences

- Release readiness can later consume exact test evidence without inheriting authority;
- acceptance coverage becomes deterministic and revision-bound;
- missing evidence remains explicit instead of being interpreted as PASS;
- FH-32B remains post-cutover and policy/human controlled.
