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
- secret broker/injection
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

## Future work

Threat model must be revisited before:
- remote write tools
- browser automation
- production deployment
- multi-user auth
- external plugin marketplace
