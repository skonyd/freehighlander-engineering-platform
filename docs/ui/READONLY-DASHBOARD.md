# FH-04 — Read-only Dashboard

**Status:** IMPLEMENTED  
**Issue:** #26

## Boundary

This is an observer UI only.

```text
SQLite read model
      ↓
read-only HTTP API
      ↓
local dashboard
```

It has no endpoints or controls for mutating:

- workflows
- roles
- providers/models
- policies
- authority
- artifacts
- runs

Only `GET` and `HEAD` are accepted. Other methods return HTTP 405.

## Run locally

After build:

```bash
npm run dashboard:start
```

Defaults:

```text
http://127.0.0.1:4310
FREEHIGHLANDER_DB=.freehighlander/runtime/freehighlander.sqlite
```

Optional:

```bash
FREEHIGHLANDER_DB=/path/to/freehighlander.sqlite \
FREEHIGHLANDER_PORT=4310 \
npm run dashboard:start
```

The database is opened with SQLite `readOnly: true`.

## API

- `GET /api/health`
- `GET /api/summary`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`
- `GET /api/runs/:runId/model-calls`
- `GET /api/runs/:runId/artifacts`
- `GET /api/models`

## Dashboard views

- run count
- human-required count
- model-call count
- token total
- actual/estimated cost
- average model latency
- run status/workflow/event/model-call table
- per-role/provider/model usage aggregates
- selected-run event/model/artifact evidence

The page refreshes observer data periodically and handles an absent database without creating one.

V3 management/configuration UI remains a separate later phase.
