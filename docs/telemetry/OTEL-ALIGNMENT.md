# OpenTelemetry Alignment

**Status:** PROPOSED

## Goal

FreeHighlander telemetry should map cleanly to OpenTelemetry instead of inventing incompatible names where standard GenAI conventions exist.

## Internal events remain canonical

FreeHighlander still owns domain events such as:

~~~text
run.started
gate.completed
finding.adjudicated
human.required
artifact.created
~~~

OpenTelemetry is an observability export/mapping layer, not the domain event store.

## GenAI mapping targets

Where compatible, exporter should map provider/model usage to current OTel GenAI semantic conventions, including concepts such as:

- provider name
- request/model identity
- input tokens
- output tokens
- cached input/cache creation tokens when exposed
- reasoning output tokens when exposed
- agent/workflow names
- tool calls

## Sensitive content

Prompt/completion content is not exported by default.

Token counts, IDs/hashes, latency and outcome are preferred.

## Trace model

Potential span hierarchy:

~~~text
workflow run
  node
    model call / command / gate
      tool call
~~~

Correlate:
- run_id
- node_id
- artifact_id
- provider request id

## Stability rule

OTel GenAI semantic conventions continue to evolve. Internal domain schemas must not copy unstable external conventions as hard persistence contracts.

Exporter version handles mapping changes.
