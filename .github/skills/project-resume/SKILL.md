---
name: project-resume
description: Reconstruct the current FreeHighlander work state after a new machine, chat, model, or session. Use when asked to continue, resume, or work in 3'lü mode.
---

Do not rely on previous chat history.

1. Read `AGENTS.md`.
2. Read `.freehighlander/state.yaml` and `PROJECT_STATE.md`.
3. Follow `docs/state/RESUME-PROTOCOL.md`.
4. Load only the minimum context profile from `.freehighlander/context.yaml`.
5. Verify local Git state and remote GitHub pointers.
6. Report phase, active work/PR, blocker, current logical role, and exact next safe action.
7. Continue only when local/remote state reconciles.

Cached state is a pointer, not authoritative gate evidence.
