# ADR-0017 — Release bounded context pre-cutover

**Status:** ACCEPTED

## Decision

Introduce `packages/release` as an authority-neutral bounded context in the FH-34A pre-cutover lane.

The context owns release candidates, artifact manifests, exact source/build revision binding, Development/Testing/Security evidence references, rollback metadata and deterministic readiness projections.

## Authority boundary

```text
release READY != deploy authority
release READY != tag/release publication authority
release READY != rollback authority
release evidence != V3 authority promotion
```

All live deployment, environment promotion, publication and rollback actions remain post-cutover policy/human-controlled behavior in FH-34B after FH-20.
