import { z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/);

export const resultBindingV1Schema = z
  .object({
    runId: identifierSchema,
    exactRevision: z.string().min(1),
    scopeHash: hashSchema,
    runSnapshotHash: hashSchema,
  })
  .strict();

export const evidenceReferenceV1Schema = z
  .object({
    artifactId: identifierSchema,
    contentHash: hashSchema,
  })
  .strict();

export const structuredFindingV1Schema = z
  .object({
    id: identifierSchema,
    severity: z.enum(['P0', 'P1', 'P2', 'P3']),
    summary: z.string().min(1),
    evidence: z.array(evidenceReferenceV1Schema).min(1),
  })
  .strict();

export const reviewResultV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('REVIEW'),
    binding: resultBindingV1Schema,
    verdict: z.enum(['PASS', 'BLOCKED']),
    findings: z.array(structuredFindingV1Schema),
    residualRisk: z.array(z.string().min(1)),
  })
  .strict();

export const testAdequacyResultV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('TEST_ADEQUACY'),
    binding: resultBindingV1Schema,
    verdict: z.enum(['SUFFICIENT', 'INSUFFICIENT']),
    coverage: z
      .object({
        acceptanceCriteria: z.boolean(),
        positivePath: z.boolean(),
        negativePath: z.boolean(),
        boundaries: z.boolean(),
        regression: z.boolean(),
      })
      .strict(),
    findings: z.array(structuredFindingV1Schema),
  })
  .strict();

export const candidateAdjudicationResultV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('CANDIDATE_ADJUDICATION'),
    binding: resultBindingV1Schema,
    decisions: z
      .array(
        z
          .object({
            candidateId: identifierSchema,
            decision: z.enum(['ACCEPTED', 'REJECTED', 'FIXED']),
            reason: z.string().min(1),
            evidence: z.array(evidenceReferenceV1Schema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const autonomousMergeReviewV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('AUTONOMOUS_MERGE_REVIEW'),
    binding: resultBindingV1Schema,
    verdict: z.enum(['APPROVE', 'BLOCK', 'HUMAN_REQUIRED']),
    findings: z.array(structuredFindingV1Schema),
    reviewerIndependenceGroup: identifierSchema,
  })
  .strict();

export const structuredRoleResultV1Schema = z.discriminatedUnion('kind', [
  reviewResultV1Schema,
  testAdequacyResultV1Schema,
  candidateAdjudicationResultV1Schema,
  autonomousMergeReviewV1Schema,
]);

export type ResultBindingV1 = z.infer<typeof resultBindingV1Schema>;
export type EvidenceReferenceV1 = z.infer<typeof evidenceReferenceV1Schema>;
export type StructuredFindingV1 = z.infer<typeof structuredFindingV1Schema>;
export type ReviewResultV1 = z.infer<typeof reviewResultV1Schema>;
export type TestAdequacyResultV1 = z.infer<typeof testAdequacyResultV1Schema>;
export type CandidateAdjudicationResultV1 = z.infer<typeof candidateAdjudicationResultV1Schema>;
export type AutonomousMergeReviewV1 = z.infer<typeof autonomousMergeReviewV1Schema>;
export type StructuredRoleResultV1 = z.infer<typeof structuredRoleResultV1Schema>;

export interface ValidStructuredRoleResult {
  readonly status: 'VALID';
  readonly value: StructuredRoleResultV1;
}

export interface MalformedStructuredRoleResult {
  readonly status: 'MALFORMED';
  readonly errors: readonly string[];
}

export type StructuredRoleParseResult = ValidStructuredRoleResult | MalformedStructuredRoleResult;

export function parseStructuredRoleResultV1(input: unknown): StructuredRoleParseResult {
  const parsed = structuredRoleResultV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'MALFORMED',
      errors: parsed.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message),
    };
  }
  return { status: 'VALID', value: parsed.data };
}

export function structuredRoleResultIsSemanticNegative(result: StructuredRoleResultV1): boolean {
  switch (result.kind) {
    case 'REVIEW':
      return result.verdict === 'BLOCKED';
    case 'TEST_ADEQUACY':
      return result.verdict === 'INSUFFICIENT';
    case 'CANDIDATE_ADJUDICATION':
      return false;
    case 'AUTONOMOUS_MERGE_REVIEW':
      return result.verdict !== 'APPROVE';
  }
}

export function structuredRoleResultCanGrantAuthority(): false {
  return false;
}

export function malformedOutputCanBecomeSemanticApproval(): false {
  return false;
}


export const runtimeErrorClassV1Schema = z.enum([
  'VALIDATION',
  'POLICY_DENIED',
  'DEPENDENCY',
  'PROVIDER',
  'ACTIVITY',
  'WORKSPACE',
  'CONFLICT',
  'TIMEOUT',
  'RATE_LIMIT',
  'AUTHENTICATION',
  'HUMAN_REQUIRED',
  'INTERNAL',
]);

export const runtimeErrorSeverityV1Schema = z.enum([
  'INFO',
  'WARNING',
  'ERROR',
  'CRITICAL',
]);

export const runtimeRetryabilityV1Schema = z.enum([
  'NEVER',
  'SAFE_IMMEDIATE',
  'AFTER_BACKOFF',
  'AFTER_USER_ACTION',
]);

export const userImpactV1Schema = z.enum([
  'WAITING',
  'DEGRADED',
  'PARTIAL',
  'BLOCKED',
]);

export const userActionKindV1Schema = z.enum([
  'NONE',
  'RETRY',
  'CHECK_CONFIGURATION',
  'REAUTHENTICATE',
  'PROVIDE_SECRET',
  'RESOLVE_CONFLICT',
  'HUMAN_DECISION',
  'CONTACT_SUPPORT',
]);

export interface RuntimeErrorPatternDefinitionV1 {
  readonly patternId: string;
  readonly errorClass: RuntimeErrorClassV1;
  readonly defaultSeverity: RuntimeErrorSeverityV1;
  readonly defaultRetryability: RuntimeRetryabilityV1;
  readonly defaultImpact: UserImpactV1;
  readonly defaultAction: UserActionKindV1;
  readonly userTitle: string;
}

export const runtimeErrorPatternCatalogV1 = [
  {
    patternId: 'FH-VALIDATION-001',
    errorClass: 'VALIDATION',
    defaultSeverity: 'ERROR',
    defaultRetryability: 'NEVER',
    defaultImpact: 'BLOCKED',
    defaultAction: 'CHECK_CONFIGURATION',
    userTitle: 'Input or configuration is invalid',
  },
  {
    patternId: 'FH-POLICY-001',
    errorClass: 'POLICY_DENIED',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_USER_ACTION',
    defaultImpact: 'BLOCKED',
    defaultAction: 'HUMAN_DECISION',
    userTitle: 'Policy blocked this operation',
  },
  {
    patternId: 'FH-DEPENDENCY-001',
    errorClass: 'DEPENDENCY',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_BACKOFF',
    defaultImpact: 'WAITING',
    defaultAction: 'RETRY',
    userTitle: 'A required dependency is not ready',
  },
  {
    patternId: 'FH-PROVIDER-001',
    errorClass: 'PROVIDER',
    defaultSeverity: 'ERROR',
    defaultRetryability: 'AFTER_BACKOFF',
    defaultImpact: 'DEGRADED',
    defaultAction: 'RETRY',
    userTitle: 'Model or tool provider is unavailable',
  },
  {
    patternId: 'FH-ACTIVITY-001',
    errorClass: 'ACTIVITY',
    defaultSeverity: 'ERROR',
    defaultRetryability: 'SAFE_IMMEDIATE',
    defaultImpact: 'PARTIAL',
    defaultAction: 'RETRY',
    userTitle: 'An execution activity failed',
  },
  {
    patternId: 'FH-WORKSPACE-001',
    errorClass: 'WORKSPACE',
    defaultSeverity: 'ERROR',
    defaultRetryability: 'AFTER_USER_ACTION',
    defaultImpact: 'BLOCKED',
    defaultAction: 'RESOLVE_CONFLICT',
    userTitle: 'Execution workspace cannot be used safely',
  },
  {
    patternId: 'FH-CONFLICT-001',
    errorClass: 'CONFLICT',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_USER_ACTION',
    defaultImpact: 'BLOCKED',
    defaultAction: 'RESOLVE_CONFLICT',
    userTitle: 'Current state conflicts with the expected revision',
  },
  {
    patternId: 'FH-TIMEOUT-001',
    errorClass: 'TIMEOUT',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_BACKOFF',
    defaultImpact: 'PARTIAL',
    defaultAction: 'RETRY',
    userTitle: 'The operation timed out',
  },
  {
    patternId: 'FH-RATELIMIT-001',
    errorClass: 'RATE_LIMIT',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_BACKOFF',
    defaultImpact: 'WAITING',
    defaultAction: 'RETRY',
    userTitle: 'Provider rate limit reached',
  },
  {
    patternId: 'FH-AUTH-001',
    errorClass: 'AUTHENTICATION',
    defaultSeverity: 'ERROR',
    defaultRetryability: 'AFTER_USER_ACTION',
    defaultImpact: 'BLOCKED',
    defaultAction: 'REAUTHENTICATE',
    userTitle: 'Authentication is required',
  },
  {
    patternId: 'FH-HUMAN-001',
    errorClass: 'HUMAN_REQUIRED',
    defaultSeverity: 'WARNING',
    defaultRetryability: 'AFTER_USER_ACTION',
    defaultImpact: 'WAITING',
    defaultAction: 'HUMAN_DECISION',
    userTitle: 'A human decision is required',
  },
  {
    patternId: 'FH-INTERNAL-001',
    errorClass: 'INTERNAL',
    defaultSeverity: 'CRITICAL',
    defaultRetryability: 'NEVER',
    defaultImpact: 'BLOCKED',
    defaultAction: 'CONTACT_SUPPORT',
    userTitle: 'FreeHighlander encountered an internal error',
  },
] as const satisfies readonly RuntimeErrorPatternDefinitionV1[];

export const safeDetailV1Schema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(500),
  })
  .strict();

export const runtimeErrorReportV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('RUNTIME_ERROR'),
    errorId: identifierSchema,
    patternId: z.enum(
      runtimeErrorPatternCatalogV1.map((pattern) => pattern.patternId) as [
        (typeof runtimeErrorPatternCatalogV1)[number]['patternId'],
        ...(typeof runtimeErrorPatternCatalogV1)[number]['patternId'][],
      ],
    ),
    errorClass: runtimeErrorClassV1Schema,
    severity: runtimeErrorSeverityV1Schema,
    retryability: runtimeRetryabilityV1Schema,
    binding: resultBindingV1Schema,
    component: identifierSchema,
    operation: identifierSchema,
    correlationId: identifierSchema,
    technicalSummary: z.string().min(1).max(1000),
    failureKind: identifierSchema.optional(),
    evidence: z.array(evidenceReferenceV1Schema),
    occurredAt: z.string().datetime({ offset: true }),
    authority: z.literal('NONE'),
  })
  .strict()
  .superRefine((value, ctx) => {
    const pattern = getRuntimeErrorPatternDefinitionV1(value.patternId);
    if (pattern.errorClass !== value.errorClass) {
      ctx.addIssue({
        code: 'custom',
        path: ['errorClass'],
        message: 'errorClass must match the registered pattern',
      });
    }
    if (value.errorClass === 'HUMAN_REQUIRED' && value.retryability !== 'AFTER_USER_ACTION') {
      ctx.addIssue({
        code: 'custom',
        path: ['retryability'],
        message: 'HUMAN_REQUIRED errors must wait for user action',
      });
    }
  });

export const userErrorContextV1Schema = z
  .object({
    runId: identifierSchema,
    exactRevision: z.string().min(1).max(200),
    component: identifierSchema,
    operation: identifierSchema,
  })
  .strict();

export const userFacingErrorV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('USER_ERROR'),
    errorId: identifierSchema,
    patternId: z.enum(
      runtimeErrorPatternCatalogV1.map((pattern) => pattern.patternId) as [
        (typeof runtimeErrorPatternCatalogV1)[number]['patternId'],
        ...(typeof runtimeErrorPatternCatalogV1)[number]['patternId'][],
      ],
    ),
    correlationId: identifierSchema,
    context: userErrorContextV1Schema,
    severity: runtimeErrorSeverityV1Schema,
    impact: userImpactV1Schema,
    retryability: runtimeRetryabilityV1Schema,
    action: userActionKindV1Schema,
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    whatHappened: z.string().min(1).max(1200),
    nextAction: z.string().min(1).max(1200),
    safeDetails: z.array(safeDetailV1Schema).max(20),
    evidence: z.array(evidenceReferenceV1Schema).max(20),
    redactionStatus: z.enum(['APPLIED', 'NOT_REQUIRED']),
    safeForUserDisplay: z.literal(true),
    authority: z.literal('NONE'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.retryability === 'AFTER_USER_ACTION' && value.action === 'NONE') {
      ctx.addIssue({
        code: 'custom',
        path: ['action'],
        message: 'AFTER_USER_ACTION errors must identify a user action',
      });
    }
    if (value.impact === 'BLOCKED' && !value.nextAction.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['nextAction'],
        message: 'BLOCKED user errors require a next action',
      });
    }
  });

export type RuntimeErrorClassV1 = z.infer<typeof runtimeErrorClassV1Schema>;
export type RuntimeErrorSeverityV1 = z.infer<typeof runtimeErrorSeverityV1Schema>;
export type RuntimeRetryabilityV1 = z.infer<typeof runtimeRetryabilityV1Schema>;
export type UserImpactV1 = z.infer<typeof userImpactV1Schema>;
export type UserActionKindV1 = z.infer<typeof userActionKindV1Schema>;
export type SafeDetailV1 = z.infer<typeof safeDetailV1Schema>;
export type UserErrorContextV1 = z.infer<typeof userErrorContextV1Schema>;
export type RuntimeErrorReportV1 = z.infer<typeof runtimeErrorReportV1Schema>;
export type UserFacingErrorV1 = z.infer<typeof userFacingErrorV1Schema>;

export interface BuildUserFacingErrorV1Input {
  readonly summary: string;
  readonly whatHappened: string;
  readonly nextAction: string;
  readonly safeDetails?: readonly SafeDetailV1[];
  readonly evidence?: readonly EvidenceReferenceV1[];
  readonly redactionStatus: 'APPLIED' | 'NOT_REQUIRED';
}

export function buildUserFacingErrorV1(
  error: RuntimeErrorReportV1,
  input: BuildUserFacingErrorV1Input,
): UserFacingErrorV1 {
  const validatedError = runtimeErrorReportV1Schema.parse(error);
  const pattern = getRuntimeErrorPatternDefinitionV1(validatedError.patternId);

  return userFacingErrorV1Schema.parse({
    schemaVersion: 1,
    kind: 'USER_ERROR',
    errorId: validatedError.errorId,
    patternId: validatedError.patternId,
    correlationId: validatedError.correlationId,
    context: {
      runId: validatedError.binding.runId,
      exactRevision: validatedError.binding.exactRevision,
      component: validatedError.component,
      operation: validatedError.operation,
    },
    severity: validatedError.severity,
    impact: pattern.defaultImpact,
    retryability: validatedError.retryability,
    action: pattern.defaultAction,
    title: pattern.userTitle,
    summary: input.summary,
    whatHappened: input.whatHappened,
    nextAction: input.nextAction,
    safeDetails: [...(input.safeDetails ?? [])],
    evidence: [...(input.evidence ?? validatedError.evidence)],
    redactionStatus: input.redactionStatus,
    safeForUserDisplay: true,
    authority: 'NONE',
  });
}

export function getRuntimeErrorPatternDefinitionV1(
  patternId: RuntimeErrorReportV1['patternId'] | UserFacingErrorV1['patternId'],
): RuntimeErrorPatternDefinitionV1 {
  const pattern = runtimeErrorPatternCatalogV1.find((candidate) => candidate.patternId === patternId);
  if (!pattern) throw new Error('unknown runtime error pattern');
  return pattern;
}

export function runtimeErrorPattern(error: RuntimeErrorReportV1): string {
  return [
    error.patternId,
    error.errorClass,
    error.component,
    error.operation,
    error.retryability,
  ].join(':');
}

export function runtimeErrorCanExposeRawCause(): false {
  return false;
}

export function userFacingErrorCanContainSecrets(): false {
  return false;
}

export function errorReportingCanGrantAuthority(): false {
  return false;
}
