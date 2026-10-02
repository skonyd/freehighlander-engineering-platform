# ADR-0025 — Activate optional single-tenant enterprise identity runtime

**Status:** ACCEPTED

## Context

ADR-0023 introduced an authority-neutral enterprise identity boundary while keeping FreeHighlander local-first and single-tenant. The post-cutover V3 authority plane, SDLC B-lane executors and FH-KUIKA runtime activation are now complete. The remaining FH-KUIKA-10 work is live identity/session enforcement, product RBAC and human-to-human approval delegation.

The activation must not turn product membership into engineering authority. It also must not introduce multi-tenant persistence without a separate isolation design.

## Decision

FreeHighlander may run an **optional single-tenant enterprise identity mode**.

The default product mode remains:

```text
local-first-single-user
enterprise identity runtime = DISABLED
```

When explicitly enabled, the enterprise runtime may provide:

- OIDC-authenticated human actors;
- exact issuer/audience/subject binding;
- bounded revocable sessions;
- users, teams and project membership;
- product-level RBAC eligibility;
- human-to-human approval delegation;
- auditable actor/session/delegation identity.

Multi-tenant persistence remains deferred.

## Authority separation

The following remain false:

```text
OIDC authenticated == HUMAN_APPROVER authority       false
RBAC eligible == execution authorized                 false
membership == SYSTEM_POLICY ALLOW                     false
team role == logical-role authority                    false
delegation == approval                                 false
```

An authenticated actor may become eligible to perform a human approval action only through current membership/delegation rules. The approval itself must still be recorded as a HUMAN decision and remain exact-bound to the current revision, action, policy and evidence.

`HUMAN_REQUIRED` remains non-delegable to models or model quorum. Human-to-human delegation does not change the principal class: the delegate remains a real HUMAN principal and approves as themselves.

## OIDC and sessions

Live enterprise mode requires:

- exact configured issuer match;
- exact configured audience match;
- stable subject binding to one actor;
- token expiration/not-before validation before session creation;
- disabled actors fail closed;
- bounded session expiry;
- membership/session revalidation at protected use time;
- no persistence of raw ID/access/refresh tokens.

Session storage may retain only bounded metadata required for currentness and audit.

## Approval delegation

Active delegation must be:

- human-to-human only;
- explicitly created by an eligible human actor;
- bound to one organization/project/action class;
- time-bounded;
- revocable;
- revalidated at use time;
- independently auditable;
- unable to alter exact revision, policy, scope or evidence requirements.

A delegate never impersonates the delegator. The approval decision records the delegate actor as the approver and carries delegation provenance separately.

## Persistence

Enterprise identity v1 remains one-organization/single-tenant per local FreeHighlander persistence domain. Durable identity state may contain actors, OIDC bindings, teams, project memberships, sessions and delegations.

Multi-tenant persistence, cross-tenant queries and tenant-aware encryption/key management require a later ADR and are not authorized by this decision.

## Security consequences

The runtime must fail closed on:

- issuer/audience/subject mismatch;
- unknown or disabled actor;
- missing/stale project membership;
- expired/revoked session;
- expired/revoked/mismatched delegation;
- attempted product-RBAC to authority escalation;
- raw token persistence or diagnostic leakage.

The threat model is updated for the live single-tenant identity boundary. Tenant-isolation threats remain future work.

## Compatibility

- existing local mode requires no identity provider;
- existing local operator behavior remains valid;
- critical capabilities remain default `DENY`;
- existing V3 capability/policy/currentness/execution gates remain authoritative;
- Full Auto remains independently OFF/SHADOW by default.

## Consequences

FH-KUIKA-10 can proceed with live OIDC/session enforcement, RBAC and approval delegation without changing the default product mode or introducing multi-tenant persistence.

## Affected work

- issue #456
- architecture contract 1.13.0
- enterprise identity contracts
- control-plane identity/session enforcement
- persistence and audit
- FH-KUIKA identity/admin UX
- threat model
