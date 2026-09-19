# FreeHighlander — Current Project State

**State status:** FH-01B SPLIT / PROVISIONAL PORT ALLOWED / AUTHORITY PROMOTION BLOCKED  
**Canonical pointer:** `.freehighlander/state.yaml`

## Completed

- FH-00 planning foundation
- FH-01A executable TypeScript platform bootstrap
- PR #17 merged
- main SHA before this planning update: `384d7264a26f68dd05e2512b8917f880a1e6a0c9`
- post-merge CI success

## FH-01B split

### FH-01B1 — provisional compatibility

Issue: **#18**

May proceed using Creator Marketplace PR #207 current exact HEAD:

`0e70f4a9680fcc5c287b7926f2aa20170c79f47d`

Mandatory state:

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

The purpose is to port/test compatibility now without trusting the unfinished reference as final authority.

### FH-01B2 — reconciliation + promotion

Issue: **#19**

Blocked until Creator Marketplace #207 completes:

1. Sonnet candidate adjudication
2. Astra final review
3. human decision
4. merge
5. post-merge smoke

After #207 closes, explicitly compare the provisional SHA with the final accepted reference SHA, inspect any delta, rerun parity/regression tests, and only then review authority promotion.

## Mandatory reminder

Do not treat FH-01B as complete until these are explicitly confirmed:

- provisional reference SHA
- final accepted reference SHA
- delta reviewed
- parity suite passed
- post-port smoke passed
- authority promotion reviewed

The Claude quota reset / #207 closure is therefore a required re-evaluation checkpoint, not just a scheduling note.
