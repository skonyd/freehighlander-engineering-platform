# FH-12 — Logical role registry and role packages

**Issue:** #43  
**Status:** COMPLETE  
**Authority effect:** NONE

## Objective

Implement immutable logical-role packages independent of provider/model identity.

## Contract

Role packages are YAML, semantically versioned and parsed through the shared role-package schema. The registry pins exact `id@version` identities for runs and produces deterministic snapshots.

Authority remains policy-bounded:
- manifests may declare only authority explicitly allowed by registration policy;
- model principals cannot claim HUMAN_APPROVER or SYSTEM_POLICY;
- the registry itself grants no authority.

Tool/action permission is fail-closed:
- explicit forbidden action => DENY;
- explicit allowed action => ALLOW;
- unknown action => DENY.

## Acceptance

- YAML parse and schema validation;
- immutable duplicate rejection;
- exact-version lookup/pinning;
- stable snapshot hash;
- authority escalation rejection;
- risk-tier and independence metadata preserved;
- architecture guard;
- protected-main CI.
