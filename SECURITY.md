# Security Policy

FreeHighlander is currently pre-release and privately developed.

## Sensitive findings

Do not place credentials, exploit material tied to private infrastructure, or other secrets in public issue text or committed artifacts.

For repository-owner development, create a private GitHub issue or communicate directly with the repository owner for sensitive findings.

## Security-sensitive areas

Changes affecting:
- authority/policy,
- model/tool permissions,
- secrets,
- sandbox/network access,
- artifact provenance,
- trusted state,
- provider credentials

must receive explicit review.

## Design principle

A model-generated security verdict is evidence/candidate output, not automatically authority. High-impact actions remain subject to policy and human control.
