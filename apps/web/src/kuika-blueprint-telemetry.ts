import type { DashboardEvent, DashboardRun } from './read-model.js';

export type FhKuikaBlueprintOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'UNKNOWN';

export interface FhKuikaBlueprintUsageObservationV1 {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly runId: string;
  readonly observedAt: string;
  readonly outcome: FhKuikaBlueprintOutcome;
}

export interface FhKuikaBlueprintTelemetryV1 {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly observedRuns: number;
  readonly resolvedRuns: number;
  readonly passedRuns: number;
  readonly failedRuns: number;
  readonly blockedRuns: number;
  readonly unknownRuns: number;
  readonly passRate: number | null;
  readonly latestObservedAt: string | null;
  readonly dataState: 'NO_DATA' | 'PARTIAL' | 'MEASURED';
  readonly authority: 'NONE';
}

export interface FhKuikaBlueprintTelemetryReadSource {
  listRuns(limit?: number): readonly DashboardRun[];
  listEvents(runId: string, limit?: number): readonly DashboardEvent[];
}

export function collectFhKuikaBlueprintUsageObservationsV1(
  source: FhKuikaBlueprintTelemetryReadSource,
  runLimit = 500,
  eventLimit = 5_000,
): readonly FhKuikaBlueprintUsageObservationV1[] {
  assertLimit(runLimit, 'runLimit', 5_000);
  assertLimit(eventLimit, 'eventLimit', 20_000);

  const observations: FhKuikaBlueprintUsageObservationV1[] = [];

  for (const run of source.listRuns(runLimit)) {
    const candidates = source
      .listEvents(run.runId, eventLimit)
      .map((event) => observationFromEvent(run, event))
      .filter((item): item is FhKuikaBlueprintUsageObservationV1 => item !== null);

    if (candidates.length === 0) continue;

    const latest = [...candidates].sort((left, right) =>
      right.observedAt.localeCompare(left.observedAt),
    )[0];
    if (latest) observations.push(latest);
  }

  return observations.sort(
    (left, right) =>
      right.observedAt.localeCompare(left.observedAt) ||
      left.blueprintId.localeCompare(right.blueprintId) ||
      left.runId.localeCompare(right.runId),
  );
}

export function buildFhKuikaBlueprintTelemetryV1(
  blueprintId: string,
  blueprintVersion: string,
  observations: readonly FhKuikaBlueprintUsageObservationV1[],
): FhKuikaBlueprintTelemetryV1 {
  requireId(blueprintId, 'blueprintId');
  requireVersion(blueprintVersion);

  const matching = observations.filter(
    (item) => item.blueprintId === blueprintId && item.blueprintVersion === blueprintVersion,
  );

  const uniqueRuns = new Map<string, FhKuikaBlueprintUsageObservationV1>();
  for (const item of matching) {
    validateObservation(item);
    const current = uniqueRuns.get(item.runId);
    if (!current || current.observedAt < item.observedAt) uniqueRuns.set(item.runId, item);
  }

  const values = [...uniqueRuns.values()];
  const passedRuns = countOutcome(values, 'PASS');
  const failedRuns = countOutcome(values, 'FAIL');
  const blockedRuns = countOutcome(values, 'BLOCKED');
  const unknownRuns = countOutcome(values, 'UNKNOWN');
  const resolvedRuns = passedRuns + failedRuns + blockedRuns;
  const observedRuns = values.length;

  return {
    blueprintId,
    blueprintVersion,
    observedRuns,
    resolvedRuns,
    passedRuns,
    failedRuns,
    blockedRuns,
    unknownRuns,
    passRate: resolvedRuns === 0 ? null : passedRuns / resolvedRuns,
    latestObservedAt:
      values.length === 0
        ? null
        : (values.map((item) => item.observedAt).sort((a, b) => b.localeCompare(a))[0] ?? null),
    dataState: observedRuns === 0 ? 'NO_DATA' : unknownRuns > 0 ? 'PARTIAL' : 'MEASURED',
    authority: 'NONE',
  };
}

export function blueprintTelemetryCanInvokeModel(): false {
  return false;
}

export function blueprintTelemetryCanGrantAuthority(): false {
  return false;
}

export function blueprintTelemetryCanModifyBlueprint(): false {
  return false;
}

function observationFromEvent(
  run: DashboardRun,
  event: DashboardEvent,
): FhKuikaBlueprintUsageObservationV1 | null {
  const payload = asRecord(event.event.payload);
  if (!payload) return null;

  const blueprintId = stringValue(payload.blueprintId);
  const blueprintVersion = stringValue(payload.blueprintVersion);
  const outcome = stringValue(payload.blueprintOutcome);

  if (!blueprintId || !blueprintVersion || !isOutcome(outcome)) return null;

  try {
    requireId(blueprintId, 'blueprintId');
    requireVersion(blueprintVersion);
  } catch {
    return null;
  }

  if (Number.isNaN(Date.parse(event.timestamp))) return null;

  return {
    blueprintId,
    blueprintVersion,
    runId: run.runId,
    observedAt: event.timestamp,
    outcome,
  };
}

function validateObservation(value: FhKuikaBlueprintUsageObservationV1): void {
  requireId(value.blueprintId, 'blueprintId');
  requireVersion(value.blueprintVersion);
  if (!value.runId.trim()) throw new Error('runId is required');
  if (Number.isNaN(Date.parse(value.observedAt))) {
    throw new Error('observedAt must be a valid timestamp');
  }
  if (!isOutcome(value.outcome)) throw new Error('invalid blueprint outcome');
}

function countOutcome(
  values: readonly FhKuikaBlueprintUsageObservationV1[],
  outcome: FhKuikaBlueprintOutcome,
): number {
  return values.filter((item) => item.outcome === outcome).length;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isOutcome(value: string | null): value is FhKuikaBlueprintOutcome {
  return value === 'PASS' || value === 'FAIL' || value === 'BLOCKED' || value === 'UNKNOWN';
}

function requireId(value: string, field: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(field + ' must use lowercase kebab-case');
  }
}

function requireVersion(value: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error('blueprintVersion must be semantic version x.y.z');
  }
}

function assertLimit(value: number, field: string, max: number): void {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(field + ' must be an integer between 1 and ' + max);
  }
}
