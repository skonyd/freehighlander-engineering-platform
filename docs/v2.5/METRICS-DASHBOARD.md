# Metrics & Dashboard

## Event-first approach

Dashboard parses structured domain events, not ad-hoc shell logs.

Initial event families:

~~~text
run.started / run.completed
node.started / node.completed
gate.started / gate.completed
model.call.started / model.call.completed
tool.call.started / tool.call.completed
artifact.created / artifact.invalidated / artifact.reused
candidate.created
finding.adjudicated
human.required / human.decision
provider.unavailable
quota.exhausted
budget.warning / budget.exhausted
checkpoint.created
~~~

## Minimum event metadata

- schema_version
- timestamp
- run_id / task_id
- workflow id/version/hash
- PR/branch/base/head revision
- node id/type
- logical role
- binding/provider/model/effort
- context profile / packet id/hash
- status/result
- duration
- retry/fallback
- failure class
- artifact/evidence ids
- budget scope/action

Model usage when available:
- input tokens
- cache-read/cached input tokens
- cache-write/creation tokens
- output tokens
- reasoning output tokens
- estimated/actual cost

## OpenTelemetry alignment

Internal domain events remain canonical.

Exporter should map compatible provider/model spans/metrics to current OpenTelemetry GenAI semantic conventions through a versioned mapping layer. See `docs/telemetry/OTEL-ALIGNMENT.md`.

Do not export prompt/completion content by default.

## First dashboard

### Runs
status, risk, duration, human-required, budget.

### Run detail
node/gate timeline, retries/fallback, exact evidence/artifacts.

### Models
role→binding/model calls, token/cache/cost, latency p50/p95, timeout/quota.

### Findings/evals
candidate/adjudicated state, agreement, precision, misses, promotion status.

### Continuity
last checkpoint, active work item, remote state, resume health.

## Storage path

1. append-only `events.jsonl` for first instrumentation
2. SQLite current/query/metadata store
3. PostgreSQL only when centralized/multi-user scale justifies it
