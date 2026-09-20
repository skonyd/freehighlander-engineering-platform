# FH-14 — Debate/council and disagreement escalation

**Issue:** #47  
**Status:** COMPLETE  
**Authority effect:** NONE

## Objective

Add bounded multi-role council semantics without turning consensus into authority.

## Contract

- at least two unique participants;
- exact role version and independence group captured per participant;
- round zero rejects peer-context use;
- one opinion per participant per round;
- rounds cannot be skipped;
- maxRounds is mandatory and finite;
- unanimous completed round may produce CONSENSUS, but grants no authority;
- disagreement continues only while bounded rounds remain;
- unresolved final-round disagreement becomes HUMAN_REQUIRED;
- council snapshot hash is deterministic.

## Acceptance

- duplicate/unknown participants fail closed;
- round-zero independence enforced;
- duplicate opinions fail closed;
- unanimous consensus is deterministic and non-authoritative;
- bounded disagreement continues then escalates;
- identical semantic sessions hash identically;
- architecture guard and protected-main CI pass.
