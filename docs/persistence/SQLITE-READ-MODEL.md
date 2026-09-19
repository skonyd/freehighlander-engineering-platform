# FH-03 — SQLite Telemetry Read Model

**Status:** IMPLEMENTED  
**Issue:** #24

## Role

SQLite is the local query/current-state/index layer over FH-02 domain events.

It does not replace the canonical telemetry event contract.

```text
events.jsonl / domain events
          ↓
     idempotent index
          ↓
       SQLite
          ↓
FH-04 read-only dashboard
```

## Schema v1

Tables:

- `schema_migrations`
- `events`
- `runs`
- `model_calls`
- `artifacts`

## Idempotency

Each serialized event receives SHA-256 identity. Re-importing the exact event produces no duplicate event,
run count, model call or artifact projection.

## Run read model

The run table exposes:

- task/run identity
- first/last timestamp
- current status
- repository/PR/branch/base/head revision
- workflow id/version/hash
- human-required flag
- event count
- model-call count
- last event type

Out-of-order older events cannot overwrite a newer run status.

## Model-call index

Completed model calls expose:

- logical role
- binding/provider/model/effort
- result/status
- duration
- retries/fallback count
- failure class
- input/cache-write/cache-read/output/reasoning/total tokens
- estimated/actual cost

## Artifact index

Artifacts track first/last observation and latest lifecycle state:

```text
OBSERVED
CREATED
INVALIDATED
REUSED
```

## SQLite settings

Local file databases use:

- foreign keys ON
- WAL journal
- synchronous NORMAL
- configurable busy timeout

FH-04 must consume query APIs rather than parsing raw shell logs.
