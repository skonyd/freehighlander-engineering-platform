# Initial Threat Model

**Status:** DRAFT

## Assets

- source code
- Git history
- provider credentials
- local model endpoints
- artifacts/evidence
- user/project private data
- authority/policy config
- human approvals
- production/runtime credentials (future)

## Trust boundaries

1. human ↔ FreeHighlander control plane
2. control plane ↔ provider adapters
3. control plane ↔ local shell/filesystem
4. control plane ↔ GitHub/SCM
5. control plane ↔ local model endpoints
6. future UI ↔ API
7. future plugin/tool adapters ↔ external systems
8. enterprise identity provider ↔ FreeHighlander identity adapter
9. organization/team/project membership ↔ product access control\n10. authenticated enterprise session ↔ protected control-plane operations\n11. active approval delegation ↔ exact human approval action

## Primary threats

### Prompt injection from repository/tool content
Untrusted text may attempt to override system/policy instructions.

Mitigation:
- treat repo/tool output as data
- separate system/policy from retrieved content
- tool permissions external to prompt

### Secret exfiltration
Model/tool may expose credentials to provider/log/artifact.

Mitigation:
- opaque `SecretHandle` + EPHEMERAL injection contract; real backend adapters intentionally pending
- redaction
- data egress policy
- default-deny tool/network access

### Privilege escalation
Role attempts actions beyond authority.

Mitigation:
- role manifest
- sandbox policy
- SYSTEM_POLICY enforcement
- unknown permission deny

### Malicious/destructive command
Generated command damages worktree/system/remote.

Mitigation:
- path/cwd limits
- destructive classification
- human-required actions
- backup/checkpoint

### Cross-model trust confusion
One model's summary is accepted as authoritative evidence.

Mitigation:
- provenance
- exact revision binding
- evidence policy
- independent review

### Stale artifact reuse
Old review reused after code/policy/prompt changed.

Mitigation:
- semantic reuse key
- content/config hashes
- invalidation reasons

### Supply-chain/plugin risk
External tool/plugin can access broad secrets/files/network.

Mitigation:
- capability manifests
- sandbox
- allowlist
- version pinning
- review/signing policy later

### Enterprise identity assertion confusion
A forged, mis-scoped or misconfigured OIDC assertion could be mapped to the wrong actor.

Mitigation:
- exact configured issuer and audience validation
- stable subject binding
- bounded provider configuration
- token time-bound validation
- no raw ID/access/refresh token persistence in telemetry, artifacts or diagnostics
- disabled actors fail closed

### Horizontal project-access escalation
A user/team may attempt to access another project through stale or mismatched membership metadata.

Mitigation:
- organization/project membership checked explicitly
- organization boundary mismatch denies access
- current membership/revocation required at use time
- product RBAC remains separate from workflow authority

### Product-role to authority confusion
OWNER/ADMIN/ENGINEER/REVIEWER membership could be incorrectly treated as logical-role, SYSTEM_POLICY or HUMAN_APPROVER authority.

Mitigation:
- separate schemas and bounded contexts
- RBAC preview never grants execution authority
- membership cannot satisfy exact human approval
- SYSTEM_POLICY remains authoritative for policy decisions

### Approval-delegation abuse
A delegation record could be used to broaden scope, extend validity or impersonate a human approver.

Mitigation:
- delegation is human-to-human only
- explicit project/action/time bounds and revocation
- revalidation at use time
- underlying exact revision/scope/evidence/policy binding remains mandatory
- delegation itself never acts as approval\n- active delegation only makes a current HUMAN actor eligible to approve within its exact project/action/time scope\n- the delegate approves as themselves and delegation provenance is audited

### Future tenant-boundary bypass
If multi-tenant persistence is introduced later, a query/key/policy bug could expose another tenant's data.

Mitigation:
- ADR-0023 explicitly forbids multi-tenant persistence in the initial enterprise preparation
- multi-tenant support requires a future ADR, isolation design, migration plan and threat-model review

### Privacy over-export / over-delete
A privacy request or lifecycle tool may export/delete records outside the intended owner scope, bypass retention, or remove AUDIT evidence.

Mitigation:
- metadata-only owner-bound privacy manifests
- SHA-256 owner-scope hashing in persisted manifest output
- DELETE planning derived from canonical retention decisions
- AUDIT/audit-referenced records remain protected
- export/deletion/AUDIT deletion authority always false in planning
- actual export/delete execution remains a separate future authority surface

## Enterprise runtime activation boundary

ADR-0025 authorizes optional single-tenant live identity/session enforcement and human-to-human approval delegation. Implementations must preserve the controls above, fail closed on session/membership/delegation currentness, and never persist raw OIDC tokens.

## Future work

Threat model must be revisited before:
- remote write tools
- browser automation
- production deployment
- multi-tenant persistence
- external plugin marketplace
