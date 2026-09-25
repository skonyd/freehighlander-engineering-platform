export type CausalSpanKind =
  | 'MODEL'
  | 'COMMAND'
  | 'GATE'
  | 'JOIN'
  | 'PARALLEL_BRANCH'
  | 'AGGREGATE'
  | 'OTHER';

export type CausalSpanStatus = 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';

export interface CausalSpanInput {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | null;
  readonly causationId?: string | null;
  readonly nodeId: string;
  readonly kind: CausalSpanKind;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly queueMs: number;
  readonly attempt: number;
  readonly status: CausalSpanStatus;
}

export interface CausalSpan extends CausalSpanInput {
  readonly parentSpanId: string | null;
  readonly causationId: string | null;
  readonly durationMs: number;
  readonly authority: 'NONE';
}

export interface CausalRunSummary {
  readonly traceId: string;
  readonly spanCount: number;
  readonly wallClockMs: number;
  readonly criticalPathMs: number;
  readonly criticalPathSpanIds: readonly string[];
  readonly maxConcurrentSpans: number;
  readonly parallelismObserved: boolean;
  readonly failedSpanIds: readonly string[];
  readonly blockedSpanIds: readonly string[];
  readonly authority: 'NONE';
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SPAN_KINDS = new Set<CausalSpanKind>([
  'MODEL',
  'COMMAND',
  'GATE',
  'JOIN',
  'PARALLEL_BRANCH',
  'AGGREGATE',
  'OTHER',
]);
const SPAN_STATUSES = new Set<CausalSpanStatus>(['SUCCEEDED', 'FAILED', 'BLOCKED', 'SKIPPED']);

export function createCausalSpan(input: CausalSpanInput): CausalSpan {
  requireIdentifier(input.traceId, 'traceId');
  requireIdentifier(input.spanId, 'spanId');
  requireIdentifier(input.nodeId, 'nodeId');

  const parentSpanId = input.parentSpanId ?? null;
  const causationId = input.causationId ?? null;
  if (parentSpanId !== null) {
    requireIdentifier(parentSpanId, 'parentSpanId');
    if (parentSpanId === input.spanId) {
      throw new Error('span cannot parent itself');
    }
  }
  if (causationId !== null) requireIdentifier(causationId, 'causationId');

  if (!SPAN_KINDS.has(input.kind)) throw new Error('unsupported causal span kind');
  if (!SPAN_STATUSES.has(input.status)) throw new Error('unsupported causal span status');
  requireNonNegativeInteger(input.startedAtMs, 'startedAtMs');
  requireNonNegativeInteger(input.finishedAtMs, 'finishedAtMs');
  requireNonNegativeInteger(input.queueMs, 'queueMs');
  if (input.finishedAtMs <= input.startedAtMs) {
    throw new Error('causal span finishedAtMs must be greater than startedAtMs');
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new Error('causal span attempt must be an integer >= 1');
  }

  return {
    ...input,
    parentSpanId,
    causationId,
    durationMs: input.finishedAtMs - input.startedAtMs,
    authority: 'NONE',
  };
}

export function buildCausalRunSummary(spans: readonly CausalSpan[]): CausalRunSummary {
  if (spans.length === 0) throw new Error('causal run summary requires at least one span');

  const byId = new Map<string, CausalSpan>();
  let traceId: string | undefined;
  for (const span of spans) {
    const validated = createCausalSpan(span);
    if (span.durationMs !== validated.durationMs || span.authority !== 'NONE') {
      throw new Error('causal span is not canonical');
    }
    if (traceId === undefined) traceId = span.traceId;
    if (span.traceId !== traceId) throw new Error('causal run spans must share one traceId');
    if (byId.has(span.spanId)) throw new Error('duplicate causal spanId: ' + span.spanId);
    byId.set(span.spanId, span);
  }

  for (const span of spans) {
    if (span.parentSpanId !== null && !byId.has(span.parentSpanId)) {
      throw new Error('causal span parent is missing: ' + span.parentSpanId);
    }
  }
  assertAcyclicParents(byId);

  const memo = new Map<string, { totalMs: number; path: readonly string[] }>();
  const bestPathFor = (spanId: string): { totalMs: number; path: readonly string[] } => {
    const cached = memo.get(spanId);
    if (cached) return cached;
    const span = byId.get(spanId);
    if (!span) throw new Error('unknown causal span: ' + spanId);
    const selfMs = span.queueMs + span.durationMs;
    const result =
      span.parentSpanId === null
        ? { totalMs: selfMs, path: [span.spanId] as readonly string[] }
        : (() => {
            const parent = bestPathFor(span.parentSpanId);
            return {
              totalMs: parent.totalMs + selfMs,
              path: [...parent.path, span.spanId],
            };
          })();
    memo.set(spanId, result);
    return result;
  };

  let critical = bestPathFor(spans[0]!.spanId);
  for (const span of spans.slice(1)) {
    const candidate = bestPathFor(span.spanId);
    if (
      candidate.totalMs > critical.totalMs ||
      (candidate.totalMs === critical.totalMs &&
        candidate.path.join('\u0000').localeCompare(critical.path.join('\u0000')) < 0)
    ) {
      critical = candidate;
    }
  }

  const starts = spans.map((span) => span.startedAtMs);
  const finishes = spans.map((span) => span.finishedAtMs);
  const wallClockMs = Math.max(...finishes) - Math.min(...starts);
  const maxConcurrentSpans = computeMaxConcurrency(spans);
  const failedSpanIds = spans
    .filter((span) => span.status === 'FAILED')
    .map((span) => span.spanId)
    .sort();
  const blockedSpanIds = spans
    .filter((span) => span.status === 'BLOCKED')
    .map((span) => span.spanId)
    .sort();

  return {
    traceId: traceId as string,
    spanCount: spans.length,
    wallClockMs,
    criticalPathMs: critical.totalMs,
    criticalPathSpanIds: critical.path,
    maxConcurrentSpans,
    parallelismObserved: maxConcurrentSpans > 1,
    failedSpanIds,
    blockedSpanIds,
    authority: 'NONE',
  };
}

export function causalTracingCanGrantAuthority(): false {
  return false;
}

export function causalTracingCanPersistHiddenReasoning(): false {
  return false;
}

function assertAcyclicParents(byId: ReadonlyMap<string, CausalSpan>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (spanId: string): void => {
    if (visited.has(spanId)) return;
    if (visiting.has(spanId)) throw new Error('causal span parent cycle detected');
    visiting.add(spanId);
    const parent = byId.get(spanId)?.parentSpanId ?? null;
    if (parent !== null) visit(parent);
    visiting.delete(spanId);
    visited.add(spanId);
  };

  for (const spanId of byId.keys()) visit(spanId);
}

function computeMaxConcurrency(spans: readonly CausalSpan[]): number {
  const events = spans.flatMap((span) => [
    { at: span.startedAtMs, delta: 1 },
    { at: span.finishedAtMs, delta: -1 },
  ]);
  events.sort((left, right) => left.at - right.at || left.delta - right.delta);

  let active = 0;
  let max = 0;
  for (const event of events) {
    active += event.delta;
    max = Math.max(max, active);
  }
  return max;
}

function requireIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(name + ' must be a bounded identifier');
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}
