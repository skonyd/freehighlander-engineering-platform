---
applyTo: "docs/**/*.md,README.md,BACKLOG.md,PROJECT_STATE.md,.freehighlander/**/*.yaml"
---

Before editing planning/state documents, read AGENTS.md and the current state pointer.

Keep accepted decisions separate from drafts. Do not silently rewrite an ACCEPTED ADR to change its meaning; supersede it with a new ADR when appropriate.

When current project phase, blocker, branch, PR, or next action changes, update PROJECT_STATE.md and .freehighlander/state.yaml consistently.

Never place secrets, raw credentials, private tokens, or machine-specific absolute paths in repository state files.
