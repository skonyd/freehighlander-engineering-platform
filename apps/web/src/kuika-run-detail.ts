import type {
  DashboardArtifact,
  DashboardEvent,
  DashboardModelCall,
  DashboardRun,
  DashboardRunDetail,
  DashboardRuntimeError,
} from './read-model.js';

export type FhKuikaRunTimelineKind =
  'RUN' | 'NODE' | 'GATE' | 'MODEL' | 'TOOL' | 'HUMAN' | 'ERROR' | 'ARTIFACT' | 'POLICY' | 'OTHER';

export interface FhKuikaRunTimelineItemV1 {
  readonly timestamp: string;
  readonly eventType: string;
  readonly kind: FhKuikaRunTimelineKind;
  readonly nodeId: string | null;
  readonly nodeType: string | null;
  readonly status: string | null;
  readonly result: string | null;
  readonly failureClass: string | null;
  readonly logicalRole: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly artifactIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface FhKuikaRunModelCallV1 extends DashboardModelCall {}

export interface FhKuikaRunEvidenceV1 {
  readonly artifactIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface FhKuikaRunDetailV1 {
  readonly schemaVersion: 1;
  readonly run: DashboardRun;
  readonly timeline: readonly FhKuikaRunTimelineItemV1[];
  readonly runtimeErrors: readonly DashboardRuntimeError[];
  readonly modelCalls: readonly FhKuikaRunModelCallV1[];
  readonly artifacts: readonly DashboardArtifact[];
  readonly evidence: FhKuikaRunEvidenceV1;
  readonly projectionAuthority: 'NONE';
}

export interface FhKuikaRunDetailReadSource {
  runDetail(runId: string, limit?: number): DashboardRunDetail | null;
}

export function buildFhKuikaRunDetailV1(
  source: FhKuikaRunDetailReadSource,
  runId: string,
  limit = 1_000,
): FhKuikaRunDetailV1 | null {
  const normalizedRunId = runId.trim();
  if (!normalizedRunId) throw new Error('runId is required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error('limit must be an integer between 1 and 10000');
  }

  const detail = source.runDetail(normalizedRunId, limit);
  if (!detail) return null;

  const timeline = detail.events.map(projectTimelineItem);
  const artifactIds = new Set<string>(detail.artifacts.map((artifact) => artifact.artifactId));
  const evidenceIds = new Set<string>();

  for (const item of timeline) {
    for (const artifactId of item.artifactIds) artifactIds.add(artifactId);
    for (const evidenceId of item.evidenceIds) evidenceIds.add(evidenceId);
  }

  return {
    schemaVersion: 1,
    run: detail.run,
    timeline,
    runtimeErrors: detail.runtimeErrors,
    modelCalls: detail.modelCalls,
    artifacts: detail.artifacts,
    evidence: {
      artifactIds: [...artifactIds].sort(),
      evidenceIds: [...evidenceIds].sort(),
    },
    projectionAuthority: 'NONE',
  };
}

export function fhKuikaRunDetailCanInvokeModel(): false {
  return false;
}

export function fhKuikaRunDetailCanMutateRuntime(): false {
  return false;
}

export function fhKuikaRunDetailCanGrantAuthority(): false {
  return false;
}

export function fhKuikaRunDetailCanExposeRawPayload(): false {
  return false;
}

function projectTimelineItem(event: DashboardEvent): FhKuikaRunTimelineItemV1 {
  const model = asRecord(event.event.model);

  return {
    timestamp: event.timestamp,
    eventType: event.type,
    kind: classifyEvent(event.type),
    nodeId: event.nodeId,
    nodeType: event.nodeType,
    status: event.status,
    result: event.result,
    failureClass: event.failureClass,
    logicalRole: safeText(model?.logicalRole),
    provider: safeText(model?.provider),
    model: safeText(model?.model),
    effort: safeText(model?.effort),
    artifactIds: safeIdentifierList(event.event.artifactIds),
    evidenceIds: safeIdentifierList(event.event.evidenceIds),
  };
}

function classifyEvent(type: string): FhKuikaRunTimelineKind {
  if (type.startsWith('run.')) return 'RUN';
  if (type.startsWith('node.')) return 'NODE';
  if (type.startsWith('gate.')) return 'GATE';
  if (type.startsWith('model.call.')) return 'MODEL';
  if (type.startsWith('tool.call.')) return 'TOOL';
  if (type.startsWith('human.')) return 'HUMAN';
  if (type === 'runtime.error.reported') return 'ERROR';
  if (type.startsWith('artifact.')) return 'ARTIFACT';
  if (type === 'policy.decision') return 'POLICY';
  return 'OTHER';
}

function safeIdentifierList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const result = new Set<string>();
  for (const entry of value) {
    const normalized = safeText(entry);
    if (normalized) result.add(normalized);
  }
  return [...result].sort();
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 500 || /[\r\n\t]/.test(normalized)) return null;
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
