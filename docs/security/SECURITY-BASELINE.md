# Security Baseline

**Status:** DRAFT

## Threat surfaces
model prompts/responses, provider credentials, repository filesystem, command execution, network tools, plugins, artifact/event storage, UI/API auth.

## Minimum controls
- secrets prompt/config repo'ya yazılmaz
- role/tool permission model
- filesystem/network scope
- command sandbox
- trusted metadata writer
- redaction hooks
- audit events
- artifact integrity hashes
- high-impact action için human approval

## Future role library
Threat Modeler, Secure Code Reviewer, Pentest Reviewer, CVE/Dependency Analyst, Secrets Reviewer, IAM Reviewer, Kubernetes/Container/Cloud Security, Privacy Reviewer.

Security candidate authority değildir; evidence + adjudication gerekir.
