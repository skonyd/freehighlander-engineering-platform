# FH-11 — Provider adapters and binding registry

**Issue:** #40  
**Status:** IN PROGRESS  
**Authority effect:** NONE

## Objective

Implement provider/binding selection on top of the frozen FH-10 architecture without coupling logical roles to vendors or allowing semantic model-shopping.

## Contracts

- Provider adapters are registered by stable provider ID.
- Model bindings are versionable configuration identities referencing a provider, model, capabilities, risk tiers and independence group.
- Binding plans define one primary and ordered fallbacks.
- Fallback policy is fixed to `availability-only`.
- Required capabilities, risk tier and independence constraints apply equally to primary and fallback.
- Binding-plan snapshots are deterministic and hash-bound.

## Fail-closed rules

- duplicate provider/binding IDs reject;
- unknown provider/binding references reject;
- bindings cannot claim capabilities their provider adapter does not expose;
- semantic/malformed output forbids fallback;
- no eligible binding returns an explicit non-selected state;
- registry configuration cannot grant authority.

## Acceptance

- deterministic provider/binding registration;
- availability fallback works;
- semantic fallback is forbidden;
- capability/risk/independence constraints are enforced;
- stable binding-plan hash;
- architecture guards;
- `npm run verify`;
- canonical state advances to FH-12.
