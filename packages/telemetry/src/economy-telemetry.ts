export type EconomyTelemetryMode = 'STANDARD' | 'TOKEN_ECONOMY';

export interface EconomyRoleEligibilityTelemetry {
  readonly logicalRole: string;
  readonly riskTier: 'NORMAL' | 'HIGH' | 'CRITICAL';
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface EconomyRuntimeSummaryTelemetryInput {
  readonly mode: EconomyTelemetryMode;
  readonly optimizerBindingId?: string;
  readonly optimizerModelId?: string;
  readonly remoteTokenTarget?: number;
  readonly candidateRemoteInputTokens: number;
  readonly finalRemoteInputTokens: number;
  readonly remoteOutputTokens: number;
  readonly cachedInputTokens: number;
  readonly reductionStages: readonly string[];
  readonly protectedContentCount: number;
  readonly localOptimizationDurationMs: number;
  readonly remoteTokenSavingRatio: number;
  readonly bypassReason?: string;
  readonly roleEligibility: readonly EconomyRoleEligibilityTelemetry[];
}

export interface EconomyRuntimeSummaryTelemetryPayload extends EconomyRuntimeSummaryTelemetryInput {
  readonly optimizerBindingId?: string;
  readonly optimizerModelId?: string;
  readonly remoteTokenTarget?: number;
  readonly bypassReason?: string;
  readonly reductionStages: readonly string[];
  readonly roleEligibility: readonly EconomyRoleEligibilityTelemetry[];
  readonly authority: 'NONE';
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;

export function buildEconomyRuntimeSummaryTelemetry(
  input: EconomyRuntimeSummaryTelemetryInput,
): EconomyRuntimeSummaryTelemetryPayload {
  if (input.mode !== 'STANDARD' && input.mode !== 'TOKEN_ECONOMY') {
    throw new Error('economy telemetry mode is invalid');
  }

  validateOptionalIdentifier(input.optimizerBindingId, 'optimizerBindingId');
  validateOptionalIdentifier(input.optimizerModelId, 'optimizerModelId');
  if (input.remoteTokenTarget !== undefined) {
    validateNonNegativeInteger(input.remoteTokenTarget, 'remoteTokenTarget');
  }

  for (const [name, value] of [
    ['candidateRemoteInputTokens', input.candidateRemoteInputTokens],
    ['finalRemoteInputTokens', input.finalRemoteInputTokens],
    ['remoteOutputTokens', input.remoteOutputTokens],
    ['cachedInputTokens', input.cachedInputTokens],
    ['protectedContentCount', input.protectedContentCount],
    ['localOptimizationDurationMs', input.localOptimizationDurationMs],
  ] as const) {
    validateNonNegativeInteger(value, name);
  }

  if (input.finalRemoteInputTokens > input.candidateRemoteInputTokens) {
    throw new Error('finalRemoteInputTokens cannot exceed candidateRemoteInputTokens');
  }
  if (input.cachedInputTokens > input.finalRemoteInputTokens) {
    throw new Error('cachedInputTokens cannot exceed finalRemoteInputTokens');
  }
  if (
    !Number.isFinite(input.remoteTokenSavingRatio) ||
    input.remoteTokenSavingRatio < 0 ||
    input.remoteTokenSavingRatio > 1
  ) {
    throw new Error('remoteTokenSavingRatio must be between 0 and 1');
  }

  const expectedRatio =
    input.candidateRemoteInputTokens === 0
      ? 0
      : (input.candidateRemoteInputTokens - input.finalRemoteInputTokens) /
        input.candidateRemoteInputTokens;
  if (Math.abs(expectedRatio - input.remoteTokenSavingRatio) > 0.000001) {
    throw new Error('remoteTokenSavingRatio must reconcile candidate and final input tokens');
  }

  const reductionStages = uniqueIdentifiers(input.reductionStages, 'reduction stage');
  const roleEligibility = [...input.roleEligibility]
    .map((entry) => {
      validateIdentifier(entry.logicalRole, 'logicalRole');
      if (!['NORMAL', 'HIGH', 'CRITICAL'].includes(entry.riskTier)) {
        throw new Error('economy role eligibility riskTier is invalid');
      }
      const reason =
        entry.reason === undefined
          ? undefined
          : validateBoundedText(entry.reason, 'role eligibility reason', 240);
      return {
        logicalRole: entry.logicalRole,
        riskTier: entry.riskTier,
        eligible: entry.eligible,
        ...(reason === undefined ? {} : { reason }),
      };
    })
    .sort((left, right) =>
      [left.logicalRole, left.riskTier]
        .join('\0')
        .localeCompare([right.logicalRole, right.riskTier].join('\0')),
    );

  const seenRoles = new Set<string>();
  for (const entry of roleEligibility) {
    const key = entry.logicalRole + ':' + entry.riskTier;
    if (seenRoles.has(key)) {
      throw new Error('duplicate economy role eligibility entry: ' + key);
    }
    seenRoles.add(key);
  }

  const bypassReason =
    input.bypassReason === undefined
      ? undefined
      : validateBoundedText(input.bypassReason, 'bypassReason', 300);

  return {
    mode: input.mode,
    ...(input.optimizerBindingId === undefined
      ? {}
      : { optimizerBindingId: input.optimizerBindingId }),
    ...(input.optimizerModelId === undefined ? {} : { optimizerModelId: input.optimizerModelId }),
    ...(input.remoteTokenTarget === undefined
      ? {}
      : { remoteTokenTarget: input.remoteTokenTarget }),
    candidateRemoteInputTokens: input.candidateRemoteInputTokens,
    finalRemoteInputTokens: input.finalRemoteInputTokens,
    remoteOutputTokens: input.remoteOutputTokens,
    cachedInputTokens: input.cachedInputTokens,
    reductionStages,
    protectedContentCount: input.protectedContentCount,
    localOptimizationDurationMs: input.localOptimizationDurationMs,
    remoteTokenSavingRatio: input.remoteTokenSavingRatio,
    ...(bypassReason === undefined ? {} : { bypassReason }),
    roleEligibility,
    authority: 'NONE',
  };
}

export function economyTelemetryCanGrantAuthority(): false {
  return false;
}

export function economyTelemetryCanInvokeModel(): false {
  return false;
}

function uniqueIdentifiers(values: readonly string[], field: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    validateIdentifier(value, field);
    if (seen.has(value)) throw new Error('duplicate ' + field + ': ' + value);
    seen.add(value);
  }
  return [...seen].sort();
}

function validateOptionalIdentifier(value: string | undefined, field: string): void {
  if (value !== undefined) validateIdentifier(value, field);
}

function validateIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(field + ' must be a bounded identifier');
}

function validateBoundedText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be bounded single-line text');
  }
  return normalized;
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer');
  }
}
