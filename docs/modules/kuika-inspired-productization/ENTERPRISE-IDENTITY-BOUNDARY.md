# FH-KUIKA-10 — Enterprise Identity Boundary

**Status:** PRE-CUTOVER PREPARATION COMPLETE  
**Architecture:** ADR-0023 / contract 1.11.0  
**Runtime authority:** NONE  
**Persistence mode:** SINGLE_TENANT

## Purpose

This document defines the authority-neutral identity/collaboration data model and migration boundary required before any live enterprise authentication or RBAC enforcement is introduced.

## Initial data model

```text
OrganizationV1
  id
  displayName
  tenantMode = SINGLE_TENANT

ActorV1
  actorId
  kind = LOCAL_USER | OIDC_USER
  displayName
  status = ACTIVE | DISABLED

OidcSubjectBindingV1
  actorId
  issuer
  subject
  audience

TeamV1
  organizationId
  teamId
  displayName

ProjectMembershipV1
  organizationId
  projectId
  actorId
  accessRoles[]

TeamMembershipV1
  organizationId
  teamId
  actorId

ApprovalDelegationDraftV1
  organizationId
  delegatorActorId
  delegateActorId
  projectId
  actionClass
  validFrom
  validUntil
  status = DRAFT
```

Product access roles are intentionally separate from FreeHighlander logical-role authority.

## Access-role scope

Initial product roles:

- `OWNER`
- `ADMIN`
- `ENGINEER`
- `REVIEWER`
- `VIEWER`

They may later determine eligibility for product actions such as viewing a project, managing membership or requesting execution. They never grant workflow/model authority and never satisfy SYSTEM_POLICY or exact human approval.

## Migration design

The future migration from current local-first state is additive:

1. create one canonical organization record, default id `local-default`;
2. create one local human actor representing the existing operator;
3. attach existing local projects to that organization;
4. create project membership for the local operator;
5. keep historical runs, approvals, artifacts, evidence and telemetry immutable;
6. do not synthesize historical approvals from the new membership;
7. introduce identity foreign keys only where current records can remain valid through nullable/backfilled references;
8. validate read-model parity before enabling any identity-aware enforcement.

Rollback before activation is schema/read-model rollback only; no existing authority decision is rewritten.

## OIDC preparation

A future OIDC adapter must validate at minimum:

- exact configured issuer;
- intended audience/client;
- stable subject;
- token time bounds;
- nonce/state where the chosen flow requires them;
- provider configuration version.

Raw ID/access/refresh tokens must never enter telemetry, artifacts, error diagnostics or lineage.

## Delegation boundary

Delegation is not active in this preparation.

A future activation must bind delegation to:

- delegator and delegate human actor ids;
- organization and project;
- explicit action class;
- validity window;
- revocation/currentness;
- immutable delegation record hash.

Even with a current delegation, the underlying approval must still bind exact revision, scope, reviewed evidence and policy context.

## Single-tenant invariant

Exactly one organization persistence boundary is supported by the preparation contract. Introducing a second tenant in the same persistence domain is unsupported and requires a new ADR.

## Activation prerequisites

Live enterprise identity/RBAC requires a later activation slice that includes:

- OIDC/session implementation and security review;
- persistent identity tables/migrations;
- authorization integration tests;
- revocation/currentness semantics;
- admin recovery/break-glass design;
- audit/retention handling;
- explicit activation review.

FH-20 and existing governance rules remain independent prerequisites for any authority-bearing operation.
