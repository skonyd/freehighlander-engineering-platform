# Repository-native project state

This directory contains small machine-readable control files required to resume FreeHighlander work from another machine or model.

## Files

- `state.yaml` — current execution pointer and blocker summary.

Human-readable detail lives in `PROJECT_STATE.md`.

## Rule

These files contain **pointers/state, not secrets and not model scratchpads**.

Large model outputs, runtime artifacts and transient logs do not belong here.

Future FH-01/FH-02 automation should validate/update these files automatically where safe.
