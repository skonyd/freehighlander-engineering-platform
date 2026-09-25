import { z } from 'zod';

import {
  buildUserFacingErrorV1,
  runtimeErrorReportV1Schema,
  safeDetailV1Schema,
  userFacingErrorV1Schema,
  type RuntimeErrorReportV1,
  type SafeDetailV1,
  type UserFacingErrorV1,
} from './runtime-results.js';

const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);

export const runtimeErrorCauseKindV1Schema = z.enum([
  'VALIDATION',
  'CONFIGURATION',
  'POLICY',
  'AUTHENTICATION',
  'SECRET_BINDING',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'TRANSPORT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
  'WORKSPACE_STATE',
  'REVISION_CONFLICT',
  'COMMAND_EXIT',
  'MALFORMED_OUTPUT',
  'INTERNAL_INVARIANT',
  'UNKNOWN',
]);

export const runtimeErrorCauseCertaintyV1Schema = z.enum([
  'CONFIRMED_SIGNAL',
  'DETERMINISTIC_RULE',
  'UNRESOLVED',
]);

export const runtimeErrorSourceLayerV1Schema = z.enum([
  'USER_INPUT',
  'POLICY',
  'ORCHESTRATION',
  'MODEL_RUNTIME',
  'PROVIDER',
  'ACTIVITY',
  'WORKSPACE',
  'GIT',
  'NETWORK',
  'DEPENDENCY',
  'CONTROL_PLANE',
  'INTERNAL',
]);

export const runtimeErrorCausalHopV1Schema = z
  .object({
    sequence: z.number().int().min(0).max(7),
    layer: runtimeErrorSourceLayerV1Schema,
    component: identifierSchema,
    operation: identifierSchema,
    code: identifierSchema,
    summary: z.string().trim().min(1).max(240),
  })
  .strict();

export const runtimeErrorDiagnosisV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('RUNTIME_ERROR_DIAGNOSIS'),
    errorId: identifierSchema,
    correlationId: identifierSchema,
    binding: z
      .object({
        runId: identifierSchema,
        exactRevision: z.string().min(1).max(200),
        scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
        runSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    causeCode: identifierSchema,
    causeKind: runtimeErrorCauseKindV1Schema,
    certainty: runtimeErrorCauseCertaintyV1Schema,
    headline: z.string().trim().min(4).max(120),
    failedStep: z.string().trim().min(2).max(160),
    rootCause: z.string().trim().min(4).max(360),
    observedSignal: z.string().trim().min(2).max(500),
    causalChain: z.array(runtimeErrorCausalHopV1Schema).min(1).max(8),
    nextAction: z.string().trim().min(4).max(500),
    retryAt: z.string().datetime({ offset: true }).optional(),
    redactionStatus: z.enum(['APPLIED', 'NOT_REQUIRED']),
    safeForUserDisplay: z.literal(true),
    authority: z.literal('NONE'),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.causalChain.forEach((hop, index) => {
      if (hop.sequence !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['causalChain', index, 'sequence'],
          message: 'causal chain sequence must be contiguous and root-first',
        });
      }
    });

    if (value.causeKind === 'UNKNOWN' && value.certainty !== 'UNRESOLVED') {
      ctx.addIssue({
        code: 'custom',
        path: ['certainty'],
        message: 'UNKNOWN cause must remain UNRESOLVED',
      });
    }

    if (value.certainty === 'UNRESOLVED' && value.causeKind !== 'UNKNOWN') {
      ctx.addIssue({
        code: 'custom',
        path: ['causeKind'],
        message: 'UNRESOLVED diagnosis must use UNKNOWN cause kind',
      });
    }
  });

export type RuntimeErrorCauseKindV1 = z.infer<typeof runtimeErrorCauseKindV1Schema>;
export type RuntimeErrorCauseCertaintyV1 = z.infer<typeof runtimeErrorCauseCertaintyV1Schema>;
export type RuntimeErrorSourceLayerV1 = z.infer<typeof runtimeErrorSourceLayerV1Schema>;
export type RuntimeErrorCausalHopV1 = z.infer<typeof runtimeErrorCausalHopV1Schema>;
export type RuntimeErrorDiagnosisV1 = z.infer<typeof runtimeErrorDiagnosisV1Schema>;

export interface BuildRuntimeErrorDiagnosisV1Input {
  readonly causeCode: string;
  readonly causeKind: RuntimeErrorCauseKindV1;
  readonly certainty: RuntimeErrorCauseCertaintyV1;
  readonly headline: string;
  readonly failedStep: string;
  readonly rootCause: string;
  readonly observedSignal: string;
  readonly causalChain: readonly RuntimeErrorCausalHopV1[];
  readonly nextAction: string;
  readonly retryAt?: string;
  readonly redactionStatus: 'APPLIED' | 'NOT_REQUIRED';
}

export interface DiagnosedUserErrorV1 {
  readonly schemaVersion: 1;
  readonly kind: 'DIAGNOSED_USER_ERROR';
  readonly diagnosis: RuntimeErrorDiagnosisV1;
  readonly userError: UserFacingErrorV1;
  readonly conciseMessage: string;
  readonly authority: 'NONE';
}

export function buildRuntimeErrorDiagnosisV1(
  error: RuntimeErrorReportV1,
  input: BuildRuntimeErrorDiagnosisV1Input,
): RuntimeErrorDiagnosisV1 {
  const validatedError = runtimeErrorReportV1Schema.parse(error);

  return runtimeErrorDiagnosisV1Schema.parse({
    schemaVersion: 1,
    kind: 'RUNTIME_ERROR_DIAGNOSIS',
    errorId: validatedError.errorId,
    correlationId: validatedError.correlationId,
    binding: validatedError.binding,
    causeCode: input.causeCode,
    causeKind: input.causeKind,
    certainty: input.certainty,
    headline: input.headline,
    failedStep: input.failedStep,
    rootCause: input.rootCause,
    observedSignal: input.observedSignal,
    causalChain: [...input.causalChain],
    nextAction: input.nextAction,
    ...(input.retryAt === undefined ? {} : { retryAt: input.retryAt }),
    redactionStatus: input.redactionStatus,
    safeForUserDisplay: true,
    authority: 'NONE',
  });
}

export function buildDiagnosedUserErrorV1(
  error: RuntimeErrorReportV1,
  diagnosis: RuntimeErrorDiagnosisV1,
  additionalSafeDetails: readonly SafeDetailV1[] = [],
): DiagnosedUserErrorV1 {
  const validatedError = runtimeErrorReportV1Schema.parse(error);
  const validatedDiagnosis = runtimeErrorDiagnosisV1Schema.parse(diagnosis);
  assertDiagnosisMatchesError(validatedError, validatedDiagnosis);

  const root = validatedDiagnosis.causalChain[0]!;
  const standardDetails: SafeDetailV1[] = [
    { label: 'Cause', value: `${validatedDiagnosis.causeKind} / ${validatedDiagnosis.causeCode}` },
    {
      label: 'Source',
      value: `${root.layer} / ${root.component} / ${root.operation}`,
    },
    { label: 'Failed step', value: validatedDiagnosis.failedStep },
    { label: 'Signal', value: validatedDiagnosis.observedSignal },
    { label: 'Certainty', value: validatedDiagnosis.certainty },
    ...(validatedDiagnosis.retryAt === undefined
      ? []
      : [{ label: 'Retry at', value: validatedDiagnosis.retryAt }]),
  ];

  const safeDetails = [...standardDetails, ...additionalSafeDetails].map((detail) =>
    safeDetailV1Schema.parse(detail),
  );
  if (safeDetails.length > 20) {
    throw new Error('diagnosed user error safe details exceed maximum');
  }

  const base = buildUserFacingErrorV1(validatedError, {
    summary: validatedDiagnosis.rootCause,
    whatHappened: buildWhatHappened(validatedDiagnosis),
    nextAction: validatedDiagnosis.nextAction,
    safeDetails,
    redactionStatus: validatedDiagnosis.redactionStatus,
  });

  const userError = userFacingErrorV1Schema.parse({
    ...base,
    title: validatedDiagnosis.headline,
  });

  return {
    schemaVersion: 1,
    kind: 'DIAGNOSED_USER_ERROR',
    diagnosis: validatedDiagnosis,
    userError,
    conciseMessage: formatRuntimeErrorDiagnosisForUser(validatedError, validatedDiagnosis),
    authority: 'NONE',
  };
}

export function formatRuntimeErrorDiagnosisForUser(
  error: RuntimeErrorReportV1,
  diagnosis: RuntimeErrorDiagnosisV1,
): string {
  const validatedError = runtimeErrorReportV1Schema.parse(error);
  const validatedDiagnosis = runtimeErrorDiagnosisV1Schema.parse(diagnosis);
  assertDiagnosisMatchesError(validatedError, validatedDiagnosis);

  const root = validatedDiagnosis.causalChain[0]!;
  const retry =
    validatedDiagnosis.retryAt === undefined ? '' : ` Retry at ${validatedDiagnosis.retryAt}.`;

  return (
    `[${validatedError.patternId}] ${validatedDiagnosis.headline}: ` +
    `${validatedDiagnosis.rootCause} ` +
    `Source ${root.component}/${root.operation}; step ${validatedDiagnosis.failedStep}. ` +
    `Next: ${validatedDiagnosis.nextAction}.${retry}`
  );
}

export function errorDiagnosisCanExposeRawCause(): false {
  return false;
}

export function errorDiagnosisCanGrantAuthority(): false {
  return false;
}

export function unresolvedDiagnosisCanClaimSpecificRootCause(): false {
  return false;
}

function buildWhatHappened(diagnosis: RuntimeErrorDiagnosisV1): string {
  const root = diagnosis.causalChain[0]!;
  const surfaced = diagnosis.causalChain[diagnosis.causalChain.length - 1]!;
  const propagation =
    diagnosis.causalChain.length === 1
      ? ''
      : ` The failure propagated to ${surfaced.component}/${surfaced.operation}.`;

  return (
    `${diagnosis.failedStep} failed at ${root.component}/${root.operation}. ` +
    `Observed signal: ${diagnosis.observedSignal}.${propagation}`
  );
}

function assertDiagnosisMatchesError(
  error: RuntimeErrorReportV1,
  diagnosis: RuntimeErrorDiagnosisV1,
): void {
  if (diagnosis.errorId !== error.errorId) {
    throw new Error('diagnosis errorId does not match runtime error');
  }
  if (diagnosis.correlationId !== error.correlationId) {
    throw new Error('diagnosis correlationId does not match runtime error');
  }
  if (JSON.stringify(diagnosis.binding) !== JSON.stringify(error.binding)) {
    throw new Error('diagnosis binding does not match runtime error');
  }

  const surfaced = diagnosis.causalChain[diagnosis.causalChain.length - 1]!;
  const surfacedIdentity = `${surfaced.component}/${surfaced.operation}`;
  const errorIdentity = `${error.component}/${error.operation}`;
  if (surfacedIdentity !== errorIdentity) {
    throw new Error('diagnosis causal chain must end at the surfaced runtime error');
  }
}
