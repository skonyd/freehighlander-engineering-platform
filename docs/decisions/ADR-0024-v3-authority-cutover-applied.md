# ADR-0024 — Apply FH-20 V3 authority cutover to the exact approved target

**Status:** ACCEPTED / APPLIED

## Context

FreeHighlander completed the V3 foundation, V2/V3 parity framework, FH-20 deterministic
readiness evaluation, exact-bound approval preparation and the canonical cutover policy.

The operator explicitly approved promoting V3 authority for the exact target revision:

`57761b7b0257c234ad41314343a22dfd53668364`

The cutover policy for `promote-v3-authority` is deterministic and separates principals:

- MODEL => `DENY`
- HUMAN => `HUMAN_REQUIRED`
- SYSTEM => `ALLOW`

The accepted V2 compatibility reference remains pinned to:

`1a8e215b78a3a5008aae6aae36488b3273733b19`

## Decision

Apply FH-20 as a state/configuration transition from the exact approved target revision.

After this transition:

```text
V2 reference                 = ACCEPTED
V2 compatibility authority  = ENABLED
V3 authority                 = ENABLED
FH-20 cutover                = APPLIED
```

The transition commit is an audit/configuration envelope around the approved target. It does not
change V3 runtime implementation under `apps/**` or `packages/**`.

## Critical capability boundary

V3 core authority activation does not automatically grant high-impact capability authority.

The following remain default `DENY` and unselected:

- Code / Git mutation
- Release / Deploy
- Infrastructure mutation
- Automatic remediation

They may become active only when the human operator explicitly selects the capability and the
control-plane policy independently allows the exact action/scope.

Full Auto remains independently OFF/SHADOW by default until its own activation conditions are
satisfied.

## Evidence

- exact operator approval: issue #420
- approved target revision: `57761b7b0257c234ad41314343a22dfd53668364`
- canonical cutover policy: PR #419
- policy verification workflow: #36778525956 = success
- accepted V2 reconciliation: PR #237
- FH-01B2 full verification workflow: #36159166117 = success
- final accepted V2 reference: `1a8e215b78a3a5008aae6aae36488b3273733b19`
- canonical promotion confirmation: delta reviewed, parity passed, post-port smoke passed,
  promotion reviewed
- cutover application PR must contain no `apps/**` or `packages/**` changes

## Post-cutover module rule

FH-30B..FH-37B and authority-bearing FH-KUIKA activation slices are no longer blocked by FH-20
itself. They are **eligible, not automatically activated**.

Each activation still obeys:

- explicit operator capability selection where applicable;
- SYSTEM_POLICY;
- exact revision/evidence/currentness rules;
- sandbox/data/secret policy;
- human approval where required.

## Consequences

- V3 becomes the active authority plane.
- V2 remains available as the accepted compatibility/reference baseline.
- Critical capabilities remain fail-closed by default.
- Legacy V2 retirement is a separate reviewed action.
- Future authority expansion cannot rely on this cutover approval as a blanket permission.
