export {
  JsonlFileEventSink,
  readJsonlEvents,
  type JsonlFileEventSinkOptions,
} from './jsonl-file-event-sink.js';

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export type EventType =
  | 'run.started'
  | 'run.completed'
  | 'node.started'
  | 'node.completed'
  | 'gate.started'
  | 'gate.completed'
  | 'model.call.started'
  | 'model.call.completed'
  | 'tool.call.started'
  | 'tool.call.completed'
  | 'artifact.created'
  | 'artifact.invalidated'
  | 'artifact.reused'
  | 'candidate.created'
  | 'finding.adjudicated'
  | 'human.required'
  | 'human.decision'
  | 'provider.unavailable'
  | 'quota.exhausted'
  | 'budget.warning'
  | 'budget.exhausted'
  | 'checkpoint.created'
  | 'shadow.opinion.completed'
  | 'shadow.reconciliation.completed'
  | 'benchmark.sample.recorded'
  | 'context.packet.built'
  | 'cache.diagnostic'
  | 'reuse.diagnostic';

export type FailureClass =
  | 'quota'
  | 'rate_limit'
  | 'auth'
  | 'provider'
  | 'transport'
  | 'timeout'
  | 'contract'
  | 'semantic'
  | 'policy'
  | 'deterministic_gate'
  | 'unknown';

export interface RevisionMetadata {
  readonly repository?: string;
  readonly pullRequest?: number;
  readonly branch?: string;
  readonly baseSha?: string;
  readonly headSha?: string;
}

export interface WorkflowMetadata {
  readonly id?: string;
  readonly version?: string;
  readonly hash?: string;
}

export interface NodeMetadata {
  readonly id?: string;
  readonly type?: string;
}

export interface ModelMetadata {
  readonly logicalRole?: string;
  readonly bindingId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly effort?: string;
}

export interface ContextMetadata {
  readonly profile?: string;
  readonly packetId?: string;
  readonly packetHash?: string;
  readonly promptVersion?: string;
  readonly contractHash?: string;
  readonly semanticReuseKey?: string;
  readonly cacheKeyOrPrefixVersion?: string;
}

export interface ExecutionMetadata {
  readonly status?: string;
  readonly result?: string;
  readonly durationMs?: number;
  readonly retryCount?: number;
  readonly fallbackCount?: number;
  readonly failureClass?: FailureClass;
}

export interface ModelUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly actualCostUsd?: number;
}

export interface BudgetMetadata {
  readonly scope?: string;
  readonly action?: string;
  readonly limit?: number;
  readonly consumed?: number;
  readonly unit?: string;
}

export interface EngineeringEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly type: EventType;
  readonly timestamp: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly revision?: RevisionMetadata;
  readonly workflow?: WorkflowMetadata;
  readonly node?: NodeMetadata;
  readonly model?: ModelMetadata;
  readonly context?: ContextMetadata;
  readonly execution?: ExecutionMetadata;
  readonly usage?: ModelUsage;
  readonly budget?: BudgetMetadata;
  readonly artifactIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly payload: TPayload;
}

export type EngineeringEventInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = Omit<EngineeringEvent<TPayload>, 'schemaVersion'>;

export function createEvent<TPayload extends Record<string, unknown>>(
  input: EngineeringEventInput<TPayload>,
): EngineeringEvent<TPayload> {
  if (!input.runId.trim()) throw new Error('runId is required');
  if (!input.type.trim()) throw new Error('event type is required');
  if (Number.isNaN(Date.parse(input.timestamp)))
    throw new Error('timestamp must be ISO-8601 compatible');

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    ...input,
  };
}

export function serializeEvent(event: EngineeringEvent): string {
  return JSON.stringify(event);
}

export function parseEvent(line: string): EngineeringEvent {
  const parsed: unknown = JSON.parse(line);
  if (!isEngineeringEvent(parsed)) {
    throw new Error('invalid telemetry event');
  }
  return parsed;
}

export function isEngineeringEvent(value: unknown): value is EngineeringEvent {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === TELEMETRY_SCHEMA_VERSION &&
    typeof record.type === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.runId === 'string' &&
    record.runId.length > 0 &&
    !!record.payload &&
    typeof record.payload === 'object' &&
    !Array.isArray(record.payload)
  );
}

export interface EventSink {
  append(event: EngineeringEvent): Promise<void>;
}

export class InMemoryEventSink implements EventSink {
  readonly events: EngineeringEvent[] = [];

  async append(event: EngineeringEvent): Promise<void> {
    this.events.push(event);
  }
}

export interface TelemetryContext {
  readonly runId: string;
  readonly taskId?: string;
  readonly revision?: RevisionMetadata;
  readonly workflow?: WorkflowMetadata;
}

export interface TelemetryEmitterOptions {
  readonly now?: () => Date;
}

export class TelemetryEmitter {
  readonly #now: () => Date;

  constructor(
    readonly context: TelemetryContext,
    readonly sink: EventSink,
    options: TelemetryEmitterOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date());
  }

  async emit<TPayload extends Record<string, unknown>>(
    type: EventType,
    payload: TPayload,
    metadata: Omit<
      Partial<EngineeringEvent<TPayload>>,
      'schemaVersion' | 'type' | 'timestamp' | 'runId' | 'taskId' | 'payload'
    > = {},
  ): Promise<EngineeringEvent<TPayload>> {
    const event = createEvent({
      type,
      timestamp: this.#now().toISOString(),
      runId: this.context.runId,
      ...(this.context.taskId ? { taskId: this.context.taskId } : {}),
      ...(this.context.revision ? { revision: this.context.revision } : {}),
      ...(this.context.workflow ? { workflow: this.context.workflow } : {}),
      ...metadata,
      payload,
    });

    await this.sink.append(event);
    return event;
  }
}

export function newRunId(): string {
  return globalThis.crypto.randomUUID();
}

export function totalUsageTokens(usage: ModelUsage): number | undefined {
  if (usage.totalTokens !== undefined) return usage.totalTokens;

  const known = [
    usage.inputTokens,
    usage.cacheWriteTokens,
    usage.outputTokens,
    usage.reasoningTokens,
  ].filter((value): value is number => value !== undefined);

  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

export function cachedInputShare(usage: ModelUsage): number | undefined {
  if (
    usage.inputTokens === undefined ||
    usage.inputTokens <= 0 ||
    usage.cachedInputTokens === undefined
  ) {
    return undefined;
  }

  return Math.min(1, Math.max(0, usage.cachedInputTokens / usage.inputTokens));
}
