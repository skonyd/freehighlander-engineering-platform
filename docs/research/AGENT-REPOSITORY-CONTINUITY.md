# Research — Agent-friendly Repository Continuity

**Date:** 2026-09-19  
**Status:** RESEARCH INPUT

## Current GitHub customization layers

GitHub currently supports several repository customization mechanisms:

- `.github/copilot-instructions.md` — repository-wide always-on Copilot rules
- `.github/instructions/*.instructions.md` — path-specific rules
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — agent instructions with surface-dependent support
- `.github/prompts/*.prompt.md` — reusable prompts
- `.github/agents/*` — custom agents with tool restrictions
- `.github/skills/*/SKILL.md` — task-specific skills loaded when relevant
- `.github/hooks/*.json` — deterministic lifecycle/tool hooks

## FreeHighlander design result

1. Root `AGENTS.md` remains vendor-neutral canonical entry.
2. Vendor files only point to canonical project state/contracts.
3. Path-specific instructions keep specialized rules out of unrelated token contexts.
4. Detailed resume/checkpoint/review procedures are also available as on-demand skills.
5. Custom agents are convenience personas/tool filters, not FreeHighlander authority.
6. Hooks are deferred until FH-01 provides real deterministic validator scripts.
7. PR/issue templates and CODEOWNERS standardize human/agent handoff.
8. Machine-readable context profiles limit token use.

## Why skills matter

GitHub guidance distinguishes always-on custom instructions from skills that are injected only when relevant. This supports our token-efficiency goal: long procedural instructions should not be repeated in every unrelated prompt.

## Why hooks are deferred

Hooks can deny tool actions, run secret checks and create audit events, but premature hooks would call nonexistent or untested scripts. FH-01 should first implement:
- state validator
- secret/staged-file check
- checkpoint verifier
- risk/tool validator

then hook them.

## Compatibility caution

Some Copilot features/custom agents remain preview or surface-dependent. They are adapters only; FreeHighlander repository state and policy do not depend on them.

## Official references

- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- https://docs.github.com/en/copilot/reference/custom-instructions-support
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- https://docs.github.com/en/copilot/concepts/agents/hooks
