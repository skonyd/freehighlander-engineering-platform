# ADR-0018 — Operations bounded context pre-cutover

**Status:** ACCEPTED

## Decision

Introduce `packages/operations` as an authority-neutral bounded context in the FH-35A pre-cutover lane.

The context owns service/resource identity, health snapshots and evidence, versioned runbooks, operational action intents and deterministic read-only projections.

## Authority boundary

```text
health state != mutation authority
operational intent != execution authority
runbook != permission to act
operations evidence != V3 authority promotion
```

Live restart, scale, deploy, rollback and configuration mutation remain post-cutover policy/human-controlled actions in FH-35B after FH-20.
