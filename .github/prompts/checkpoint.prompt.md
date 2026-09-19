---
description: Create a safe cross-machine/model handoff checkpoint
---

Prepare a FreeHighlander handoff checkpoint.

Follow docs/state/RESUME-PROTOCOL.md.

Before committing:
- run relevant deterministic verification,
- inspect git status,
- ensure no secrets/runtime artifacts are staged,
- update PROJECT_STATE.md and .freehighlander/state.yaml if state changed,
- append docs/state/HISTORY.md using CHECKPOINT-TEMPLATE.md,
- record exact next action and work that must NOT be repeated.

Create a checkpoint commit on the current feature branch and push it.

Do not merge merely to create a handoff.
