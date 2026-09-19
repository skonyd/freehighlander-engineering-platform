# FreeHighlander — Current Project State

**State status:** FH-03 COMPLETE / FH-01B2 BLOCKED  
**Canonical pointer:** `.freehighlander/state.yaml`

## Completed

- FH-00 planning foundation
- FH-01A executable TypeScript platform bootstrap
- FH-01B1 provisional V2 compatibility port
- FH-02 append-only telemetry event history
- FH-03 SQLite telemetry read model

FH-03 provides:

- SQLite schema migration v1
- idempotent SHA-256 event ingestion
- run current/read model
- model-call index
- artifact lifecycle index
- JSONL history import
- out-of-order run-status protection
- query APIs for dashboard work

The canonical data relationship is:

```text
FH-02 domain events / events.jsonl
              ↓
         SQLite index
              ↓
       read/query model
              ↓
FH-04 read-only dashboard
```

SQLite is not a replacement for event provenance.

## V2 authority remains blocked

```text
REFERENCE_STATUS = PROVISIONAL
AUTHORITY         = DISABLED
```

FH-01B2 issue **#19** still requires Creator Marketplace #207 final acceptance, merge and post-merge smoke.

## Next unblocked work

FH-04 read-only dashboard.

The dashboard is an observer only. It may query runs/events/model-calls/artifacts but must not mutate
workflow, role, provider, policy or authority configuration.
