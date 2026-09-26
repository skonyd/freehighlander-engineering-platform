export {
  buildEconomyRuntimeSummaryTelemetry,
  economyTelemetryCanGrantAuthority,
  economyTelemetryCanInvokeModel,
  type EconomyRoleEligibilityTelemetry,
  type EconomyRuntimeSummaryTelemetryInput,
  type EconomyRuntimeSummaryTelemetryPayload,
  type EconomyTelemetryMode,
} from './economy-telemetry.js';

export {
  buildRuntimeErrorTelemetryPayload,
  runtimeErrorTelemetryCanExposeRawCause,
  runtimeErrorTelemetryCanGrantAuthority,
  type RuntimeErrorTelemetryDiagnosisInput,
  type RuntimeErrorTelemetryInput,
  type RuntimeErrorTelemetryPayload,
} from './runtime-error-telemetry.js';

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
  | 'provider.health.checked'
  | 'model.catalog.refreshed'
  | 'model.binding.changed'
  | 'model.qualification.changed'
  | 'provider.circuit.opened'
  | 'provider.circuit.half_opened'
  | 'provider.circuit.closed'
  | 'quota.exhausted'
  | 'budget.warning'
  | 'budget.exhausted'
  | 'checkpoint.created'
  | 'shadow.opinion.completed'
  | 'shadow.reconciliation.completed'
  | 'benchmark.sample.recorded'
  | 'context.packet.built'
  | 'cache.diagnostic'
  | 'reuse.diagnostic'
  | 'orchestration.span.completed'
  | 'orchestration.run.summary'
  | 'policy.decision'
  | 'data.redaction'
  | 'provider.egress.decision'
  | 'sandbox.decision'
  | 'retention.plan.action'
  | 'persistence.integrity.checked'
  | 'persistence.backup.completed'
  | 'persistence.restore.completed'
  | 'lineage.validation.failed'
  | 'full_auto.quorum.completed'
  | 'full_auto.merge.intent'
  | 'full_auto.merge.result'
  | 'runtime.error.reported'
  | 'economy.runtime.summary';

export type OrchestrationTraceEventType =
  'orchestration.span.completed' | 'orchestration.run.summary';

export interface OrchestrationTraceEventPayload extends Record<string, unknown> {
  readonly kind: 'SPAN' | 'RUN_SUMMARY';
  readonly traceId: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly causationId?: string;
  readonly nodeId?: string;
  readonly spanKind?: string;
  readonly status?: string;
  readonly attempt?: number;
  readonly durationMs?: number;
  readonly queueMs?: number;
  readonly wallClockMs?: number;
  readonly criticalPathMs?: number;
  readonly criticalPathSpanIds?: readonly string[];
  readonly spanCount?: number;
  readonly maxConcurrentSpans?: number;
  readonly parallelismObserved?: boolean;
}

const orchestrationTracePayloadKeys = new Set([
  'kind',
  'traceId',
  'spanId',
  'parentSpanId',
  'causationId',
  'nodeId',
  'spanKind',
  'status',
  'attempt',
  'durationMs',
  'queueMs',
  'wallClockMs',
  'criticalPathMs',
  'criticalPathSpanIds',
  'spanCount',
  'maxConcurrentSpans',
  'parallelismObserved',
]);

export function createOrchestrationTraceEvent(
  input: Omit<EngineeringEventInput<OrchestrationTraceEventPayload>, 'type'> & {
    readonly type: OrchestrationTraceEventType;
  },
): EngineeringEvent<OrchestrationTraceEventPayload> {
  validateOrchestrationTracePayload(input.payload);
  const expectedKind = input.type === 'orchestration.span.completed' ? 'SPAN' : 'RUN_SUMMARY';
  if (input.payload.kind !== expectedKind) {
    throw new Error('orchestration trace telemetry kind does not match event type');
  }
  if (input.payload.kind === 'SPAN') {
    for (const field of [
      'spanId',
      'nodeId',
      'spanKind',
      'status',
      'attempt',
      'durationMs',
    ] as const) {
      if (input.payload[field] === undefined) {
        throw new Error(`orchestration span telemetry requires ${field}`);
      }
    }
  } else {
    for (const field of [
      'wallClockMs',
      'criticalPathMs',
      'criticalPathSpanIds',
      'spanCount',
      'maxConcurrentSpans',
      'parallelismObserved',
    ] as const) {
      if (input.payload[field] === undefined) {
        throw new Error(`orchestration run summary telemetry requires ${field}`);
      }
    }
  }
  return createEvent(input);
}

function validateOrchestrationTracePayload(payload: OrchestrationTraceEventPayload): void {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!orchestrationTracePayloadKeys.has(key)) {
      throw new Error(`orchestration trace telemetry field is not allowed: ${key}`);
    }
  }

  for (const [name, value] of [
    ['traceId', payload.traceId],
    ['spanId', payload.spanId],
    ['parentSpanId', payload.parentSpanId],
    ['causationId', payload.causationId],
    ['nodeId', payload.nodeId],
    ['spanKind', payload.spanKind],
    ['status', payload.status],
  ] as const) {
    if (value !== undefined && !value.trim()) {
      throw new Error(`orchestration trace telemetry ${name} must not be empty`);
    }
  }
  if (!payload.traceId.trim()) {
    throw new Error('orchestration trace telemetry traceId is required');
  }

  for (const [name, value] of [
    ['attempt', payload.attempt],
    ['durationMs', payload.durationMs],
    ['queueMs', payload.queueMs],
    ['wallClockMs', payload.wallClockMs],
    ['criticalPathMs', payload.criticalPathMs],
    ['spanCount', payload.spanCount],
    ['maxConcurrentSpans', payload.maxConcurrentSpans],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`orchestration trace telemetry ${name} must be a non-negative integer`);
    }
  }
  if (payload.attempt !== undefined && payload.attempt < 1) {
    throw new Error('orchestration trace telemetry attempt must be >= 1');
  }

  if (payload.criticalPathSpanIds !== undefined) {
    const seen = new Set<string>();
    for (const spanId of payload.criticalPathSpanIds) {
      if (!spanId.trim()) {
        throw new Error('orchestration trace telemetry criticalPathSpanIds must not be empty');
      }
      if (seen.has(spanId)) {
        throw new Error('orchestration trace telemetry criticalPathSpanIds must be unique');
      }
      seen.add(spanId);
    }
  }
}

export type FullAutoEventType =
  'full_auto.quorum.completed' | 'full_auto.merge.intent' | 'full_auto.merge.result';

export interface FullAutoEventPayload extends Record<string, unknown> {
  readonly action: 'QUORUM' | 'MERGE_INTENT' | 'MERGE_RESULT';
  readonly profile: 'OFF' | 'SAFE' | 'BALANCED' | 'CUSTOM';
  readonly riskTier: 'NORMAL' | 'HIGH' | 'CRITICAL';
  readonly exactRevision: string;
  readonly reviewScopeHash: string;
  readonly bindingSnapshotHash: string;
  readonly quorumHash?: string;
  readonly decisionHash?: string;
  readonly policyHash?: string;
  readonly reviewerABindingId?: string;
  readonly reviewerAModel?: string;
  readonly reviewerAEffort?: string;
  readonly reviewerAIndependenceGroup?: string;
  readonly reviewerAVerdict?: 'APPROVE' | 'REJECT' | 'BLOCKED' | 'INSUFFICIENT';
  readonly reviewerBBindingId?: string;
  readonly reviewerBModel?: string;
  readonly reviewerBEffort?: string;
  readonly reviewerBIndependenceGroup?: string;
  readonly reviewerBVerdict?: 'APPROVE' | 'REJECT' | 'BLOCKED' | 'INSUFFICIENT';
  readonly roundCount?: number;
  readonly quorumStatus?: 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'INSUFFICIENT';
  readonly policyDecision?: 'ALLOW' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED' | 'DENY';
  readonly intentStatus?: 'SHADOW_INTENT_READY' | 'BLOCKED';
  readonly mergeAttempted?: boolean;
  readonly mergeSucceeded?: boolean;
  readonly resultStatus?: 'SUCCEEDED' | 'BLOCKED' | 'FAILED';
  readonly reasonCode?: string;
}

const fullAutoPayloadKeys = new Set([
  'action',
  'profile',
  'riskTier',
  'exactRevision',
  'reviewScopeHash',
  'bindingSnapshotHash',
  'quorumHash',
  'decisionHash',
  'policyHash',
  'reviewerABindingId',
  'reviewerAModel',
  'reviewerAEffort',
  'reviewerAIndependenceGroup',
  'reviewerAVerdict',
  'reviewerBBindingId',
  'reviewerBModel',
  'reviewerBEffort',
  'reviewerBIndependenceGroup',
  'reviewerBVerdict',
  'roundCount',
  'quorumStatus',
  'policyDecision',
  'intentStatus',
  'mergeAttempted',
  'mergeSucceeded',
  'resultStatus',
  'reasonCode',
]);

export function createFullAutoEvent(
  input: Omit<EngineeringEventInput<FullAutoEventPayload>, 'type'> & {
    readonly type: FullAutoEventType;
  },
): EngineeringEvent<FullAutoEventPayload> {
  validateFullAutoPayload(input.payload);

  const expectedAction = {
    'full_auto.quorum.completed': 'QUORUM',
    'full_auto.merge.intent': 'MERGE_INTENT',
    'full_auto.merge.result': 'MERGE_RESULT',
  } as const;
  if (input.payload.action !== expectedAction[input.type]) {
    throw new Error(`Full Auto telemetry action does not match event type ${input.type}`);
  }

  if (input.payload.action === 'QUORUM') {
    for (const field of [
      'quorumHash',
      'reviewerABindingId',
      'reviewerAModel',
      'reviewerAIndependenceGroup',
      'reviewerAVerdict',
      'reviewerBBindingId',
      'reviewerBModel',
      'reviewerBIndependenceGroup',
      'reviewerBVerdict',
      'roundCount',
      'quorumStatus',
    ] as const) {
      if (input.payload[field] === undefined) {
        throw new Error(`Full Auto quorum telemetry requires ${field}`);
      }
    }
  }

  if (input.payload.action === 'MERGE_INTENT') {
    for (const field of [
      'quorumHash',
      'decisionHash',
      'policyHash',
      'policyDecision',
      'intentStatus',
    ] as const) {
      if (input.payload[field] === undefined) {
        throw new Error(`Full Auto merge-intent telemetry requires ${field}`);
      }
    }
  }

  if (input.payload.action === 'MERGE_RESULT') {
    for (const field of [
      'decisionHash',
      'mergeAttempted',
      'mergeSucceeded',
      'resultStatus',
    ] as const) {
      if (input.payload[field] === undefined) {
        throw new Error(`Full Auto merge-result telemetry requires ${field}`);
      }
    }
    if (input.payload.mergeSucceeded === true && input.payload.mergeAttempted !== true) {
      throw new Error('Full Auto merge result cannot succeed without an attempted merge');
    }
  }

  return createEvent(input);
}

function validateFullAutoPayload(payload: FullAutoEventPayload): void {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!fullAutoPayloadKeys.has(key)) {
      throw new Error(`Full Auto telemetry field is not allowed: ${key}`);
    }
  }

  if (!['OFF', 'SAFE', 'BALANCED', 'CUSTOM'].includes(payload.profile)) {
    throw new Error('Full Auto telemetry profile is invalid');
  }
  if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(payload.riskTier)) {
    throw new Error('Full Auto telemetry riskTier is invalid');
  }
  if (!payload.exactRevision.trim()) {
    throw new Error('Full Auto telemetry exactRevision is required');
  }

  for (const [name, value] of [
    ['reviewScopeHash', payload.reviewScopeHash],
    ['bindingSnapshotHash', payload.bindingSnapshotHash],
    ['quorumHash', payload.quorumHash],
    ['decisionHash', payload.decisionHash],
    ['policyHash', payload.policyHash],
  ] as const) {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`Full Auto telemetry ${name} must be lowercase sha256`);
    }
  }

  for (const [name, value] of [
    ['reviewerABindingId', payload.reviewerABindingId],
    ['reviewerAModel', payload.reviewerAModel],
    ['reviewerAEffort', payload.reviewerAEffort],
    ['reviewerAIndependenceGroup', payload.reviewerAIndependenceGroup],
    ['reviewerBBindingId', payload.reviewerBBindingId],
    ['reviewerBModel', payload.reviewerBModel],
    ['reviewerBEffort', payload.reviewerBEffort],
    ['reviewerBIndependenceGroup', payload.reviewerBIndependenceGroup],
    ['reasonCode', payload.reasonCode],
  ] as const) {
    if (value !== undefined && !value.trim()) {
      throw new Error(`Full Auto telemetry ${name} must not be empty`);
    }
  }

  if (
    payload.roundCount !== undefined &&
    (!Number.isInteger(payload.roundCount) || payload.roundCount < 1)
  ) {
    throw new Error('Full Auto telemetry roundCount must be an integer >= 1');
  }
}

export type ModelCatalogEventType =
  'model.catalog.refreshed' | 'model.binding.changed' | 'model.qualification.changed';

export interface ModelCatalogEventPayload extends Record<string, unknown> {
  readonly action: 'REFRESH' | 'BINDING_CHANGE' | 'QUALIFICATION_CHANGE';
  readonly providerId: string;
  readonly modelId?: string;
  readonly bindingId?: string;
  readonly logicalRole?: string;
  readonly riskTier?: 'NORMAL' | 'HIGH' | 'CRITICAL';
  readonly previousHash?: string;
  readonly currentHash: string;
  readonly previousState?: string;
  readonly currentState?: string;
  readonly itemCount?: number;
  readonly fallbackBindingIds?: readonly string[];
  readonly returnPolicy?: 'STAY_ON_FALLBACK' | 'ASK_BEFORE_RETURN' | 'AUTO_RETURN';
}

const modelCatalogPayloadKeys = new Set([
  'action',
  'providerId',
  'modelId',
  'bindingId',
  'logicalRole',
  'riskTier',
  'previousHash',
  'currentHash',
  'previousState',
  'currentState',
  'itemCount',
  'fallbackBindingIds',
  'returnPolicy',
]);

export function createModelCatalogEvent(
  input: Omit<EngineeringEventInput<ModelCatalogEventPayload>, 'type'> & {
    readonly type: ModelCatalogEventType;
  },
): EngineeringEvent<ModelCatalogEventPayload> {
  validateModelCatalogPayload(input.payload);
  const expectedAction = {
    'model.catalog.refreshed': 'REFRESH',
    'model.binding.changed': 'BINDING_CHANGE',
    'model.qualification.changed': 'QUALIFICATION_CHANGE',
  } as const;
  if (input.payload.action !== expectedAction[input.type]) {
    throw new Error(`model catalog telemetry action does not match event type ${input.type}`);
  }
  return createEvent(input);
}

function validateModelCatalogPayload(payload: ModelCatalogEventPayload): void {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!modelCatalogPayloadKeys.has(key)) {
      throw new Error(`model catalog telemetry payload field is not allowed: ${key}`);
    }
  }

  if (!payload.providerId.trim()) {
    throw new Error('model catalog telemetry providerId is required');
  }

  for (const [name, value] of [
    ['modelId', payload.modelId],
    ['bindingId', payload.bindingId],
    ['logicalRole', payload.logicalRole],
    ['previousState', payload.previousState],
    ['currentState', payload.currentState],
  ] as const) {
    if (value !== undefined && !value.trim()) {
      throw new Error(`model catalog telemetry ${name} must not be empty`);
    }
  }

  for (const [name, value] of [
    ['previousHash', payload.previousHash],
    ['currentHash', payload.currentHash],
  ] as const) {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`model catalog telemetry ${name} must be lowercase sha256`);
    }
  }

  if (
    payload.riskTier !== undefined &&
    !['NORMAL', 'HIGH', 'CRITICAL'].includes(payload.riskTier)
  ) {
    throw new Error('model catalog telemetry riskTier is invalid');
  }

  if (
    payload.itemCount !== undefined &&
    (!Number.isInteger(payload.itemCount) || payload.itemCount < 0)
  ) {
    throw new Error('model catalog telemetry itemCount must be a non-negative integer');
  }

  if (payload.fallbackBindingIds !== undefined) {
    if (payload.action !== 'BINDING_CHANGE') {
      throw new Error('fallbackBindingIds are only valid for binding-change telemetry');
    }
    if (!Array.isArray(payload.fallbackBindingIds)) {
      throw new Error('model catalog telemetry fallbackBindingIds must be an array');
    }
    const seen = new Set<string>();
    for (const bindingId of payload.fallbackBindingIds) {
      if (typeof bindingId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(bindingId)) {
        throw new Error('model catalog telemetry fallbackBindingIds contain an invalid identifier');
      }
      if (seen.has(bindingId)) {
        throw new Error('model catalog telemetry fallbackBindingIds must be unique');
      }
      seen.add(bindingId);
    }
  }

  if (
    payload.returnPolicy !== undefined &&
    !['STAY_ON_FALLBACK', 'ASK_BEFORE_RETURN', 'AUTO_RETURN'].includes(payload.returnPolicy)
  ) {
    throw new Error('model catalog telemetry returnPolicy is invalid');
  }
  if (payload.returnPolicy !== undefined && payload.action !== 'BINDING_CHANGE') {
    throw new Error('returnPolicy is only valid for binding-change telemetry');
  }

  if (payload.action === 'REFRESH' && payload.modelId !== undefined) {
    throw new Error('catalog refresh telemetry must remain aggregate and omit modelId');
  }
}

export type HardeningEventType =
  | 'policy.decision'
  | 'data.redaction'
  | 'provider.egress.decision'
  | 'sandbox.decision'
  | 'retention.plan.action'
  | 'persistence.integrity.checked'
  | 'persistence.backup.completed'
  | 'persistence.restore.completed'
  | 'lineage.validation.failed';

export type HardeningEventOutcome = 'ALLOW' | 'DENY' | 'PASS' | 'FAIL' | 'PLANNED' | 'SKIPPED';

export interface HardeningEventPayload extends Record<string, unknown> {
  readonly category: string;
  readonly action: string;
  readonly outcome: HardeningEventOutcome;
  readonly reasonCode: string;
  readonly subjectId?: string;
  readonly resourceId?: string;
  readonly policyHash?: string;
  readonly contentHash?: string;
  readonly itemCount?: number;
}

const hardeningPayloadKeys = new Set([
  'category',
  'action',
  'outcome',
  'reasonCode',
  'subjectId',
  'resourceId',
  'policyHash',
  'contentHash',
  'itemCount',
]);

export function createHardeningEvent(
  input: Omit<EngineeringEventInput<HardeningEventPayload>, 'type'> & {
    readonly type: HardeningEventType;
  },
): EngineeringEvent<HardeningEventPayload> {
  validateHardeningPayload(input.payload);
  return createEvent(input);
}

function validateHardeningPayload(payload: HardeningEventPayload): void {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!hardeningPayloadKeys.has(key)) {
      throw new Error(`hardening telemetry payload field is not allowed: ${key}`);
    }
  }

  for (const [name, value] of [
    ['category', payload.category],
    ['action', payload.action],
    ['reasonCode', payload.reasonCode],
  ] as const) {
    if (!value.trim()) throw new Error(`hardening telemetry ${name} is required`);
  }

  if (!['ALLOW', 'DENY', 'PASS', 'FAIL', 'PLANNED', 'SKIPPED'].includes(payload.outcome)) {
    throw new Error('hardening telemetry outcome is invalid');
  }

  for (const [name, value] of [
    ['subjectId', payload.subjectId],
    ['resourceId', payload.resourceId],
  ] as const) {
    if (value !== undefined && !value.trim()) {
      throw new Error(`hardening telemetry ${name} must not be empty`);
    }
  }

  for (const [name, value] of [
    ['policyHash', payload.policyHash],
    ['contentHash', payload.contentHash],
  ] as const) {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`hardening telemetry ${name} must be lowercase sha256`);
    }
  }

  if (
    payload.itemCount !== undefined &&
    (!Number.isInteger(payload.itemCount) || payload.itemCount < 0)
  ) {
    throw new Error('hardening telemetry itemCount must be a non-negative integer');
  }
}

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

export interface ProviderMetadata {
  readonly id: string;
  readonly available?: boolean;
  readonly circuitState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly failureKind?: string;
  readonly nextProbeAtMs?: number;
  readonly retryAfterMs?: number;
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
  readonly provider?: ProviderMetadata;
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
