---
name: project-checkpoint
description: Prepare a safe cross-machine or cross-model FreeHighlander handoff. Use before ending work or switching machines/models.
---

Follow `docs/state/RESUME-PROTOCOL.md` and `docs/state/CHECKPOINT-TEMPLATE.md`.

Required:
1. finish smallest safe work unit,
2. run relevant deterministic checks,
3. inspect Git status and staged content,
4. verify no secrets/runtime-only artifacts are being committed,
5. update state files only if project state changed,
6. append a concise HISTORY entry,
7. commit on feature branch,
8. push,
9. verify remote contains continuation-critical work.

An unpushed local diff is not a valid handoff.
