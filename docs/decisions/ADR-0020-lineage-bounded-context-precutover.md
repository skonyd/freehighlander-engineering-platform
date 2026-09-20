# ADR-0020 — Engineering lineage bounded context pre-cutover

**Status:** ACCEPTED

## Decision

Introduce `packages/lineage` as the authority-neutral FH-37A implementation of the previously accepted ADR-0008 / #9 engineering-lineage direction.

The package is relational-first and graph-shaped. Stable versioned entities and explicit typed relations form the authoritative digital thread. Authoritative relations require exact entity-version endpoints plus evidence with trusted provenance.

Semantic/vector similarity is discovery-only and cannot establish authoritative lineage. A graph database remains deferred until measured need.

## Authority boundary

```text
lineage state != decision authority
semantic discovery != authoritative lineage
lineage evidence != merge/release/deploy authority
lineage query != mutation authority
```

FH-37B remains post-cutover and blocked by FH-20.
