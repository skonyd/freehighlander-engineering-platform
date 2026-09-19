# FreeHighlander — Agent / Model Entry Point

This file is the canonical entry point for any AI model, coding agent or human resuming work in this repository.

## Resume command

When the user says **"3'lü modda devam edelim"**, **"kaldığımız yerden devam"**, or equivalent:

1. Do not guess the previous state.
2. Read, in order:
   - `.freehighlander/state.yaml`
   - `PROJECT_STATE.md`
   - `docs/state/RESUME-PROTOCOL.md`
   - `docs/state/TRIPLE-MODE.md`
3. Read `.freehighlander/context.yaml` and load only the smallest context profile required for the current task.
4. Verify Git/remote state before modifying anything.
5. Continue only the current active work item and current workflow stage.
6. Preserve authority, reviewer-independence and fail-closed rules.
7. Before ending or switching machines, create a repository checkpoint as defined in the resume protocol.

## Canonical sources

Order of precedence:

1. ACCEPTED ADRs
2. `.freehighlander/state.yaml` for current execution pointer
3. `PROJECT_STATE.md` for human-readable current state
4. active GitHub PR / issue
5. `docs/planning/PR-ROADMAP.md`
6. `BACKLOG.md`
7. other DRAFT planning documents

If two sources conflict, do not silently choose. Surface the conflict and use the higher-precedence source after remote verification.

## Context discipline

Do not load the entire repository by default.

Use `.freehighlander/context.yaml`:
- `resume-minimal` for continuation,
- `planning` for product/architecture work,
- `implementation` for bounded coding,
- `review` for independent review.

Expand context only when an active dependency requires it.

## Repository purpose

This is the main FreeHighlander product repository. It contains both product code and planning/documentation.

Implementation order:
1. multi-model automation/control-plane foundation,
2. telemetry/dashboard,
3. Qwen/local-model benchmarking and offloading,
4. V3 role/model/workflow engine,
5. SDLC modules.

## Non-negotiable invariants

- LLM output is data, never authority.
- producer != final approver.
- unknown/unverifiable gate = FAIL/STALE, never PASS.
- exact revision/evidence binding is required for authoritative artifacts.
- fallback is for availability failures, not semantic FAIL/BLOCKED/INSUFFICIENT.
- model identity is not authority; logical role/contract is.
- CRITICAL/high-impact policy may require human approval.
- do not silently lower risk.
- do not manually forge trusted state/artifact metadata.
- do not merge when the active policy says HUMAN REQUIRED.
- no secret may be committed to repository state/handoff files.

## Cross-machine rule

A machine-local terminal history, chat history, scratch file or unpushed branch is **not project state**.

Project state must be recoverable from:
- Git remote,
- GitHub PR/issues,
- repository state files.

Before changing machines, push a safe checkpoint. A continuation that depends on an unpushed local change is incomplete.

## Current logical role

Do not infer your authority from your model name. Determine the current logical role/stage from:
- `.freehighlander/state.yaml`
- `.freehighlander/triple-mode.yaml`
- active workflow/policy.

If the preferred model for a role is unavailable, follow fallback/authority policy. Do not impersonate a missing independent reviewer when independence is required.

## GitHub-native helpers

When supported by the client:
- reusable resume prompt: `.github/prompts/resume.prompt.md`
- reusable checkpoint prompt: `.github/prompts/checkpoint.prompt.md`
- logical-role helper agents: `.github/agents/`
- path-scoped instructions: `.github/instructions/`

These helpers do not supersede repository policy or authority.
