import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const TRACE_SPAN_TYPE = 'orchestration.span.completed';
const TRACE_SUMMARY_TYPE = 'orchestration.run.summary';

export function loadRunEvents(databasePath, runId, limit = 10_000) {
  requireText(databasePath, 'databasePath');
  requireText(runId, 'runId');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error('limit must be an integer between 1 and 10000');
  }
  if (!existsSync(databasePath)) {
    throw new Error(`telemetry database does not exist: ${databasePath}`);
  }

  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    timeout: 5_000,
  });
  try {
    const rows = database
      .prepare(
        `SELECT event_json
         FROM events
         WHERE run_id = ?
         ORDER BY timestamp ASC, id ASC
         LIMIT ?`,
      )
      .all(runId, limit);
    return rows.map((row) => JSON.parse(String(row.event_json)));
  } finally {
    database.close();
  }
}

export function buildRunInspectorReport(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('run inspector requires at least one event');
  }

  const runId = requireText(events[0]?.runId, 'runId');
  for (const event of events) {
    if (event?.runId !== runId) {
      throw new Error('run inspector events must belong to one runId');
    }
  }

  const spanEvents = events.filter((event) => event.type === TRACE_SPAN_TYPE);
  const summaryEvents = events.filter((event) => event.type === TRACE_SUMMARY_TYPE);
  const spans = spanEvents.map((event) => spanFromEvent(event));
  validateCausalGraph(spans);

  const latestSummary =
    summaryEvents.length === 0
      ? null
      : summaryFromEvent(summaryEvents[summaryEvents.length - 1]);
  validateTraceConsistency(spans, latestSummary);

  const criticalPath = new Set(latestSummary?.criticalPathSpanIds ?? []);
  const childrenByParent = new Map();
  for (const span of spans) {
    if (span.parentSpanId === null) continue;
    const children = childrenByParent.get(span.parentSpanId) ?? [];
    children.push(span.spanId);
    childrenByParent.set(span.parentSpanId, children);
  }
  for (const children of childrenByParent.values()) children.sort();

  const timeline = spans
    .map((span) => ({
      ...span,
      childSpanIds: childrenByParent.get(span.spanId) ?? [],
      criticalPath: criticalPath.has(span.spanId),
    }))
    .sort(
      (left, right) =>
        Date.parse(left.completedAt) - Date.parse(right.completedAt) ||
        left.spanId.localeCompare(right.spanId),
    );

  return {
    schemaVersion: 1,
    runId,
    traceAvailable: spans.length > 0,
    traceId: latestSummary?.traceId ?? spans[0]?.traceId ?? null,
    rootSpanIds: timeline
      .filter((span) => span.parentSpanId === null)
      .map((span) => span.spanId)
      .sort(),
    timeline,
    parallelBranchSpanIds: timeline
      .filter((span) => span.spanKind === 'PARALLEL_BRANCH')
      .map((span) => span.spanId),
    summary: latestSummary,
    reuseDiagnostics: events
      .filter((event) => event.type === 'reuse.diagnostic' || event.type === 'artifact.reused')
      .map(compactDiagnostic),
    gateOutcomes: events
      .filter(
        (event) =>
          event.type === 'gate.completed' ||
          event.type === 'policy.decision' ||
          event.type === 'human.required',
      )
      .map(compactGateOutcome),
    authority: 'NONE',
    hiddenReasoningPersisted: false,
  };
}

export function runInspectorCanGrantAuthority() {
  return false;
}

export function runInspectorCanPersistHiddenReasoning() {
  return false;
}

function spanFromEvent(event) {
  const payload = requireRecord(event.payload, 'span payload');
  const traceId = requireText(payload.traceId, 'traceId');
  const spanId = requireText(payload.spanId, 'spanId');
  const nodeId = requireText(payload.nodeId, 'nodeId');
  const spanKind = requireText(payload.spanKind, 'spanKind');
  const status = requireText(payload.status, 'status');
  const attempt = requireInteger(payload.attempt, 'attempt', 1);
  const durationMs = requireInteger(payload.durationMs, 'durationMs', 0);
  const queueMs = payload.queueMs === undefined ? 0 : requireInteger(payload.queueMs, 'queueMs', 0);
  const completedAt = requireTimestamp(event.timestamp);
  const completionMs = Date.parse(completedAt);

  return {
    traceId,
    spanId,
    parentSpanId: optionalText(payload.parentSpanId),
    causationId: optionalText(payload.causationId),
    nodeId,
    spanKind,
    status,
    attempt,
    queueMs,
    durationMs,
    inferredStartedAt: new Date(completionMs - durationMs).toISOString(),
    inferredQueuedAt: new Date(completionMs - durationMs - queueMs).toISOString(),
    completedAt,
    model: compactModel(event.model),
    execution: compactExecution(event.execution),
    artifactIds: uniqueSortedStrings(event.artifactIds),
    evidenceIds: uniqueSortedStrings(event.evidenceIds),
  };
}

function summaryFromEvent(event) {
  const payload = requireRecord(event.payload, 'run summary payload');
  return {
    traceId: requireText(payload.traceId, 'traceId'),
    wallClockMs: requireInteger(payload.wallClockMs, 'wallClockMs', 0),
    criticalPathMs: requireInteger(payload.criticalPathMs, 'criticalPathMs', 0),
    criticalPathSpanIds: uniqueSortedPreserveOrder(
      payload.criticalPathSpanIds,
      'criticalPathSpanIds',
    ),
    spanCount: requireInteger(payload.spanCount, 'spanCount', 0),
    maxConcurrentSpans: requireInteger(payload.maxConcurrentSpans, 'maxConcurrentSpans', 0),
    parallelismObserved: requireBoolean(payload.parallelismObserved, 'parallelismObserved'),
    completedAt: requireTimestamp(event.timestamp),
  };
}

function validateCausalGraph(spans) {
  const byId = new Map();
  for (const span of spans) {
    if (byId.has(span.spanId)) throw new Error(`duplicate run inspector spanId: ${span.spanId}`);
    byId.set(span.spanId, span);
  }
  for (const span of spans) {
    if (span.parentSpanId !== null && !byId.has(span.parentSpanId)) {
      throw new Error(`run inspector span parent is missing: ${span.parentSpanId}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (spanId) => {
    if (visited.has(spanId)) return;
    if (visiting.has(spanId)) throw new Error('run inspector causal cycle detected');
    visiting.add(spanId);
    const parent = byId.get(spanId)?.parentSpanId ?? null;
    if (parent !== null) visit(parent);
    visiting.delete(spanId);
    visited.add(spanId);
  };
  for (const spanId of byId.keys()) visit(spanId);
}

function validateTraceConsistency(spans, summary) {
  const traceIds = new Set(spans.map((span) => span.traceId));
  if (traceIds.size > 1) throw new Error('run inspector spans must share one traceId');
  if (summary !== null && traceIds.size === 1 && !traceIds.has(summary.traceId)) {
    throw new Error('run inspector summary traceId mismatch');
  }
  if (summary !== null && summary.spanCount !== spans.length) {
    throw new Error('run inspector summary spanCount mismatch');
  }
  if (summary !== null) {
    const spanIds = new Set(spans.map((span) => span.spanId));
    for (const spanId of summary.criticalPathSpanIds) {
      if (!spanIds.has(spanId)) {
        throw new Error(`run inspector critical path span is missing: ${spanId}`);
      }
    }
  }
}

function compactDiagnostic(event) {
  const payload = isRecord(event.payload) ? event.payload : {};
  return {
    type: event.type,
    timestamp: requireTimestamp(event.timestamp),
    nodeId: optionalText(event.node?.id),
    status: firstString(
      payload.status,
      payload.outcome,
      event.execution?.status,
      event.execution?.result,
    ),
    reasonCode: firstString(payload.reasonCode, payload.reason),
    reused: firstBoolean(payload.reused, payload.hit),
    artifactIds: uniqueSortedStrings(event.artifactIds),
  };
}

function compactGateOutcome(event) {
  const payload = isRecord(event.payload) ? event.payload : {};
  return {
    type: event.type,
    timestamp: requireTimestamp(event.timestamp),
    nodeId: optionalText(event.node?.id),
    status: firstString(
      event.execution?.status,
      event.execution?.result,
      payload.status,
      payload.outcome,
    ),
    reasonCode: firstString(payload.reasonCode, payload.reason),
    policyHash: safeHash(payload.policyHash),
  };
}

function compactModel(model) {
  if (!isRecord(model)) return null;
  const compact = {
    logicalRole: optionalText(model.logicalRole),
    bindingId: optionalText(model.bindingId),
    provider: optionalText(model.provider),
    model: optionalText(model.model),
    effort: optionalText(model.effort),
  };
  return Object.values(compact).some((value) => value !== null) ? compact : null;
}

function compactExecution(execution) {
  if (!isRecord(execution)) return null;
  const compact = {
    status: optionalText(execution.status),
    result: optionalText(execution.result),
    retryCount: optionalInteger(execution.retryCount),
    fallbackCount: optionalInteger(execution.fallbackCount),
    failureClass: optionalText(execution.failureClass),
  };
  return Object.values(compact).some((value) => value !== null) ? compact : null;
}

function uniqueSortedStrings(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('artifact/evidence ids must be non-empty strings');
  }
  return [...new Set(value)].sort();
}

function uniqueSortedPreserveOrder(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const normalized = requireText(item, field);
    if (seen.has(normalized)) throw new Error(`${field} must be unique`);
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function safeHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

function requireTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('event timestamp must be ISO-8601 compatible');
  }
  return new Date(Date.parse(value)).toISOString();
}

function requireInteger(value, field, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer >= ${minimum}`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`);
  return value;
}

function requireRecord(value, field) {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
