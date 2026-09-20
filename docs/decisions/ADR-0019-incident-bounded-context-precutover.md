# ADR-0019 — Incident bounded context pre-cutover

**Status:** ACCEPTED

## Decision

Introduce `packages/incident` as an authority-neutral bounded context in the FH-36A pre-cutover lane.

The context owns incident identity, bounded lifecycle state, affected-resource references, evidence/timeline records, operational-intent references and deterministic read-only incident projections.

## Authority boundary

```text
incident state != mutation authority
mitigation intent != execution authority
resolved incident != release/deploy authority
incident evidence != V3 authority promotion
```

Automatic remediation and live infrastructure mutation remain post-cutover policy/human-controlled actions in FH-36B after FH-20.
