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
    patternId: z.string().regex(/^FH-[A-Z][A-Z0-9_]*-[0-9]{3}$/),
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
    if (value.errorClass === 'HUMAN_REQUIRED' && value.retryability !== 'AFTER_USER_ACTION') {
      ctx.addIssue({
        code: 'custom',
        path: ['retryability'],
        message: 'HUMAN_REQUIRED errors must wait for user action',
      });
    }
  });

export const userFacingErrorV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('USER_ERROR'),
    errorId: identifierSchema,
    patternId: z.string().regex(/^FH-[A-Z][A-Z0-9_]*-[0-9]{3}$/),
    correlationId: identifierSchema,
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
export type RuntimeErrorReportV1 = z.infer<typeof runtimeErrorReportV1Schema>;
export type UserFacingErrorV1 = z.infer<typeof userFacingErrorV1Schema>;

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
