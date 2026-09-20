# FH-15 — Policy-as-code and human approval

**Issue:** #49  
**Status:** IN PROGRESS

## Objective

Implement deterministic policy evaluation and exact-bound human approval without allowing model/system principals to impersonate a human approver.

## Contract

- semantic-versioned immutable policy definition;
- no match => DENY;
- rule precedence is DENY > HUMAN_REQUIRED > ALLOW;
- policy rules bind action/risk/principal/data classification;
- HUMAN_REQUIRED is explicit, never inferred from model preference;
- approval request binds policy hash, run snapshot, repository, revision, action, risk and evidence;
- human decision binds exact request hash and approver identity;
- non-human principals cannot issue human decisions;
- V3 remains SHADOW_ONLY until FH-20.

## Acceptance

- deterministic policy hash and order-independent evaluation;
- fail-closed default;
- deny precedence;
- exact human request hash;
- non-human approval rejected;
- replay/mismatch rejected by binding verification;
- architecture guards;
- protected-main CI.
