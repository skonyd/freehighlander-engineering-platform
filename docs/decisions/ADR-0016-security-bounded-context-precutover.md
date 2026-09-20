# ADR-0016 — Security bounded context pre-cutover contract

**Status:** ACCEPTED

## Context

FH-33A must represent security scanning and findings as exact-revision evidence
without allowing a scanner outcome or module implementation to waive findings or
grant release authority.

## Decision

1. Introduce `packages/security` as an authority-neutral bounded context.
2. Security plans bind repository, exact revision, exact policy hash and required
   scanner identities/versions.
3. Scanner evidence binds the same repository, revision, policy and scanner version.
4. Findings bind scanner identity, control identity, severity and digest evidence.
5. Remediated findings require separate remediation evidence.
6. Missing/untrusted required scanner evidence is `INSUFFICIENT_EVIDENCE`.
7. Open HIGH/CRITICAL findings are `BLOCKED`.
8. `CLEAR` is evidence only and cannot authorize merge/release/deployment.
9. The Security bounded context cannot waive findings by itself.

## Architecture contract effect

This additive change evolves:

- contract version: `1.3.0 -> 1.4.0`
- accepted ADRs: add `ADR-0016`
- bounded contexts: add `security`

V3 authority remains `SHADOW_ONLY`.
