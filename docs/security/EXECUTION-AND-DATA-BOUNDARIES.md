# Execution and Data Boundaries

**Status:** ACCEPTED DIRECTION

## Security objective

A model should never receive more filesystem, command, network, secret or data access than the active logical role requires.

## Layered authorization

~~~text
Role permission
   ∩
Workflow node permission
   ∩
Sandbox policy
   ∩
Data/provider policy
   ∩
Human approval when required
        =
effective permission
~~~

No single layer can grant access forbidden by another stricter layer.

## Filesystem

Default:
- read current repository
- write only when role is WRITER and path scope allows
- no arbitrary home/system access
- no sibling-repo traversal without explicit permission

## Commands

Every execution should capture:
- command id
- logical role
- cwd
- timeout
- exit code
- sanitized stdout/stderr reference
- risk classification

Shell command text containing secrets should not be persisted verbatim.

## Network

Network access should become an explicit tool capability.

Future policy can express:
- allow github.com read/write
- allow provider API
- deny arbitrary outbound
- allow observability endpoints read-only

## Secrets

Handle/reference semantics are now implemented as an authority-neutral governance contract in `packages/governance/src/secret-broker.ts`.

~~~text
opaque SecretHandle
        ↓
role ∩ workflow ∩ sandbox SECRET_ACCESS
        ↓
explicit positive TTL
        ↓
EPHEMERAL injection plan
        ↓
metadata-only receipt
~~~

Current invariants:
- `SecretHandle` never contains a raw secret value or secret locator;
- persistence of secret values is forbidden;
- secret values cannot cross the remote-model boundary;
- prompt/model identity cannot request raw secret material;
- command-environment injection requires a bounded explicit environment-variable name;
- injection plans are `EPHEMERAL`, log-redacted and authority `NONE`;
- actual secret backend resolution/injection adapters are intentionally not implemented pre-cutover.

A future backend adapter may consume an approved opaque plan and return a metadata-only receipt, but the resolved value must remain outside persisted domain state.

## Privacy lifecycle manifests

Privacy EXPORT/DELETE requests are represented as metadata-only planning manifests in `packages/governance/src/privacy-lifecycle.ts`.

Current invariants:
- raw data payloads are never embedded in the manifest;
- owner scope is matched in-memory and persisted only as a SHA-256 scope hash;
- DELETE planning is derived from the canonical retention plan;
- AUDIT and audit-referenced records remain protected;
- non-expired/active records remain retained;
- purge candidates remain candidates only;
- export execution, deletion and AUDIT deletion are always unauthorized by the manifest itself.

The manifest is planning/evidence only. It does not perform data export, database/file deletion or retention-policy bypass.

## Data egress

The pre-invocation portion of the egress sequence is now implemented in `packages/governance/src/provider-egress-preparation.ts`.

Before any provider invocation candidate is produced:
1. validate bounded packet/provider/binding identity and JSON-compatible payload shape,
2. classify packet data,
3. evaluate canonical provider/binding policy,
4. fail closed on unknown runtime classification,
5. redact forbidden fields,
6. hash only the sanitized payload deterministically,
7. produce metadata-only `provider.egress.decision` telemetry payload,
8. return an authority-neutral candidate packet only when policy allows.

The preparation contract cannot invoke a provider and cannot grant authority. SECRET remote egress returns no candidate packet and no content hash.

Actual provider invocation remains a separate runtime action and must not infer authority from a successful preparation result.

## Logging rule

Log identifiers and hashes where possible, not sensitive payloads.

Good:
~~~text
artifact_id=...
packet_hash=...
provider_request_id=...
~~~

Avoid:
~~~text
full token
full secret-bearing environment
raw private prompt by default
~~~

## Human escalation

Actions that can materially alter remote Git history, production infrastructure, credentials/IAM or production data should be policy-gated and may require explicit human approval.
