# Resume Protocol

**Status:** ACCEPTED

## Goal

A fresh clone on a different machine, with a different model and no chat history, must be able to determine:
- what project phase is active,
- which branch/PR is active,
- what is blocked,
- what already passed,
- what action is next,
- what authority the current model has.

## Start protocol

### 1. Synchronize

```bash
git fetch --all --prune
git status --short
git branch --show-current
git log -1 --oneline
git remote -v
```

Do not delete or overwrite unexpected local changes.

### 2. Run repository reconciliation

```bash
npm run project:resume
```

The command compares the canonical state pointer with the checked-out branch, local HEAD, remote branch HEAD and active PR metadata. A stale/missing/mismatched pointer exits non-zero and must be reconciled rather than guessed.

### 3. Read state

Read in this order:
1. `AGENTS.md`
2. `.freehighlander/state.yaml`
3. `PROJECT_STATE.md`
4. active PR/issue
5. accepted ADRs referenced by active work
6. active PR roadmap section

### 4. Verify pointers

Compare repository state with GitHub:
- branch exists,
- active PR is open/expected,
- remote HEAD is current,
- dependency PR state is current.

Any mismatch is a reconciliation task, not permission to guess.

### 5. Identify current logical role

Read `TRIPLE-MODE.md`.

The currently running model must not assume it can perform an independent review merely because the preferred reviewer is unavailable.

### 6. Continue only the active step

Do not opportunistically start future FH work while an earlier dependency/gate is unresolved unless the roadmap explicitly marks it independent.

## Machine switch / handoff protocol

Before switching from home → work, work → home, or model → model:

1. Finish the smallest safe unit of work.
2. Run relevant deterministic checks.
3. Ensure no secrets/transient artifacts are staged.
4. Update state files if the phase, branch, blocker or next action changed.
5. Append one entry to `HISTORY.md`.
6. Commit.
7. Push the feature branch.
8. For an explicit repository-native checkpoint, run:

```bash
npm run project:checkpoint -- --write
```

This is allowed only on a clean feature branch. It appends `HISTORY.md`, commits the handoff entry, pushes the branch and verifies the remote SHA.
9. Confirm remote branch contains the checkpoint.
10. Prefer a clean worktree.

A checkpoint is handoff metadata only. It never implies a semantic/model/policy gate passed.

### Incomplete implementation

If code is incomplete but must move machines:
- use a feature branch;
- make an explicit WIP/checkpoint commit;
- never merge the WIP commit merely because it exists;
- record exactly what remains in `PROJECT_STATE.md`;
- push it.

An uncommitted local diff is not a valid cross-machine handoff.

## Minimal user command

On another machine/model, the user should be able to say:

> Repo'yu aç. AGENTS.md ve PROJECT_STATE.md'yi oku. 3'lü modda kaldığımız yerden devam et.

The agent must reconstruct context from Git/GitHub rather than asking the user to repeat the project history.

## End protocol

A session is not considered safely handed off until current canonical state exists on the remote repository.
