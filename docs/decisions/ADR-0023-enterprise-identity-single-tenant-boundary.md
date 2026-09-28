# ADR-0023 — Enterprise identity boundary stays single-tenant before multi-tenant evolution

**Status:** ACCEPTED

## Context

FreeHighlander is currently a local-first, single-user engineering control plane. FH-KUIKA-10 introduces possible enterprise identity and collaboration capabilities such as OIDC, users/teams, RBAC, project membership, approval delegation and organization policy.

Those capabilities must not silently redefine the existing authority model. In particular:

- product access roles are not logical-role authority;
- organization membership is not SYSTEM_POLICY authorization;
- an OIDC identity is not automatically a HUMAN_APPROVER;
- team membership must not satisfy exact human approval;
- collaboration metadata must not weaken project, revision, evidence, sandbox or policy boundaries.

Moving directly to multi-tenant persistence would also add a new isolation/security boundary before the existing local-first product has crossed FH-20.

## Decision

FreeHighlander will prepare FH-KUIKA-10 as an **enterprise-ready single-tenant identity boundary**.

The first enterprise identity contract may model:

- one organization boundary;
- stable human actor identities;
- OIDC subject bindings;
- users and teams;
- project memberships;
- product-level RBAC eligibility;
- organization policy references;
- approval-delegation drafts and audit metadata.

The first implementation must remain authority-neutral and must not activate login/session enforcement, remote identity-provider integration, approval delegation, or mutation authority.

Multi-tenant persistence is explicitly deferred. Supporting more than one tenant in one persistence domain requires a future ADR, migration/isolation design, security review and architecture-contract evolution.

## Authority separation

The following equivalences are forbidden:

```text
OIDC authenticated == HUMAN_APPROVER               false
organization member == SYSTEM_POLICY ALLOW          false
RBAC eligible == execution authorized               false
team role == logical role authority                  false
delegation record == approval                        false
```

RBAC may eventually determine whether an actor is eligible to request or view an operation. It does not replace governance policy, exact approvals, sandbox/data policy, workflow role authority or FH-20 cutover state.

## Approval delegation

Any future delegation mechanism must be:

- human-to-human only;
- explicit and time-bounded;
- constrained to an organization/project/action class;
- revocable;
- auditable;
- revalidated at use time;
- unable to change the exact revision, scope, policy context or evidence required by the underlying approval.

Delegation preparation is metadata only before a separate activation review.

## Persistence decision

Initial enterprise preparation remains **single tenant**.

A migration from current local state may introduce a canonical local organization and local human actor while preserving existing run/artifact/evidence identities. Existing records are not rewritten to imply approvals or memberships that did not historically exist.

No cross-tenant key, query or policy model is introduced in this ADR.

## Security consequences

The threat model must add:

- OIDC issuer/audience/subject confusion;
- stale membership and revocation;
- horizontal project-access escalation;
- team-to-authority confusion;
- approval-delegation abuse;
- identity/session secret leakage;
- future tenant-boundary bypass.

OIDC tokens and raw session credentials must not be persisted in telemetry, artifacts or user-facing diagnostics.

## Alternatives rejected

### Multi-tenant persistence now

Rejected because it introduces isolation, keying, migration, authorization and incident-response complexity before there is a product requirement that justifies it.

### Reusing logical roles as RBAC roles

Rejected because workflow/model authority and human product access are different domains.

### Treating OIDC authentication as approval authority

Rejected because authentication proves an identity assertion, not policy authorization for an exact action.

### Storing raw identity-provider tokens for replay

Rejected because tokens are secrets and replay/audit should use safe identity/session metadata instead.

## Consequences

- FH-KUIKA-10 can prepare schemas, read models, migration planning and UX without changing V3 authority.
- Existing local-first behavior remains valid.
- Enterprise access roles are clearly separated from engineering logical-role authority.
- Multi-tenant support remains an explicit future architecture decision.
- FH-20 remains unchanged and V3 stays `SHADOW_ONLY`.

## Affected work

- FH-KUIKA-10 enterprise collaboration / identity boundary
- architecture contract 1.11.0
- threat model
- shared contracts
- future auth/session/RBAC implementation
- future enterprise migration tooling
