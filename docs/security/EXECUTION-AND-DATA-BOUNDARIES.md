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

Prefer handle/reference semantics:

~~~text
role requests secret capability
        ↓
policy validates
        ↓
broker injects short-lived value
        ↓
tool process
        ↓
value not persisted
~~~

## Data egress

Before remote-model invocation:
1. classify packet data,
2. evaluate provider/binding policy,
3. redact forbidden fields,
4. record egress decision,
5. invoke provider.

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
