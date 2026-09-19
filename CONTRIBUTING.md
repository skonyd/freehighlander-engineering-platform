# Contributing to FreeHighlander

FreeHighlander currently follows a single-owner, AI-assisted engineering workflow.

## Start

1. Read `AGENTS.md`.
2. Resume state using `docs/state/RESUME-PROTOCOL.md`.
3. Work from a GitHub issue / FH work item.
4. Use a feature branch.
5. Keep the PR bounded.

## Before implementation

A work item should satisfy `docs/planning/DEFINITION-OF-READY-DONE.md`.

Architecture/policy changes should link a decision/ADR.

## Before PR

- run relevant tests/checks,
- update affected docs,
- document risk and authority impact,
- update project state only when current state changed,
- ensure all continuation-critical work is pushed.

Use `.github/PULL_REQUEST_TEMPLATE.md`.

## Model-generated work

AI output is not accepted merely because a model produced it. Code and decisions are subject to deterministic checks, independent review and policy/human boundaries.

## Secrets

Never commit credentials, access tokens, model/API secrets or sensitive runtime artifacts.
