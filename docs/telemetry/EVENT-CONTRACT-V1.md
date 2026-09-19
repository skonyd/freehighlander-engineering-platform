# Telemetry Event Contract v1

**Status:** IMPLEMENTED IN FH-02  
**Issue:** #22

## Canonical model

Internal FreeHighlander domain events are the canonical telemetry source. Exporters such as OpenTelemetry
are adapters over this event history; they do not replace it.

Initial durable path:

```text
.freehighlander/runtime/events.jsonl
```

Runtime telemetry is intentionally Git-ignored.

## Event envelope

Every event contains:

- `schemaVersion = 1`
- `type`
- `timestamp`
- `runId`
- optional `taskId`
- revision metadata
- workflow metadata
- node metadata
- model/binding/provider metadata
- execution/retry/fallback/failure metadata
- model usage
- budget metadata
- artifact/evidence references
- event-specific payload

## Event families

```text
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
```

## Usage fields

When providers expose them:

- input tokens
- cached input/cache-read tokens
- cache-write tokens
- output tokens
- reasoning tokens
- provider total tokens
- estimated cost
- actual cost

Provider-reported `totalTokens` wins when present. Otherwise the telemetry helper derives a total from
known non-cache-read accounting fields.

## Privacy

Prompt/completion content is not a first-class field in the event envelope and is not captured by
default. Payload producers remain responsible for policy-compliant data.

## Durability

`JsonlFileEventSink`:

- appends one JSON event per line
- serializes concurrent appends within one process
- creates parent directories
- uses restrictive file mode by default
- fsyncs by default
- reports corrupt readback line numbers

FH-03 will index/query this history through SQLite without changing the event contract.
