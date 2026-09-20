# Security Policy

FreeHighlander is currently pre-release.

## Reporting a sensitive vulnerability

Do **not** put credentials, private infrastructure details, working exploit material, tokens, secret values, or other sensitive vulnerability details in a public GitHub issue, pull request, discussion, commit, or artifact.

Preferred reporting path:

1. If the repository UI offers **Security → Report a vulnerability**, use that private vulnerability-reporting / security-advisory flow.
2. If that private flow is not available, contact the repository owner or maintainer through a private channel before sharing sensitive technical details.
3. A public issue may be created only after sensitive details have been removed or after a maintainer explicitly confirms that a sanitized public tracking issue is appropriate.

A normal issue in a public repository must be treated as public. Do not rely on a "private GitHub issue" for confidential disclosure.

## What to include privately

When possible, include:
- affected commit or version;
- affected package/component;
- impact and prerequisites;
- deterministic reproduction steps;
- whether credentials or private infrastructure are involved;
- suggested mitigation, if known.

Do not include live production credentials. Use redacted or synthetic examples.

## Security-sensitive areas

Changes affecting:
- authority/policy;
- model/tool permissions;
- secrets;
- sandbox/network access;
- artifact provenance;
- trusted state;
- provider credentials;
- CI credentials or dependency provenance

must receive explicit review.

## Design principle

A model-generated security verdict is evidence/candidate output, not automatically authority. High-impact actions remain subject to policy and human control.
