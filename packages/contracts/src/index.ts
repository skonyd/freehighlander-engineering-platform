import { z } from 'zod';

export const riskTierSchema = z.enum(['NORMAL', 'HIGH', 'CRITICAL']);
export type RiskTier = z.infer<typeof riskTierSchema>;

export const authorityLevelSchema = z.enum([
  'ADVISORY',
  'CANDIDATE',
  'WRITER',
  'ADJUDICATOR',
  'FINAL_REVIEWER',
  'HUMAN_APPROVER',
  'SYSTEM_POLICY',
]);
export type AuthorityLevel = z.infer<typeof authorityLevelSchema>;

export const rolePackageSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    purpose: z.string().min(1),
    authority: z.array(authorityLevelSchema).min(1),
    allowedActions: z.array(z.string()).default([]),
    forbiddenActions: z.array(z.string()).default([]),
    allowedRiskTiers: z.array(riskTierSchema).min(1),
    promptContract: z.string().min(1),
    inputContract: z.string().min(1),
    outputContract: z.string().min(1),
    evidencePolicy: z.string().min(1),
    sandboxPolicy: z.string().min(1),
    independenceGroupRequired: z.boolean().default(false),
  })
  .strict();
export type RolePackage = z.infer<typeof rolePackageSchema>;

export const workflowNodeKindSchema = z.enum([
  'MODEL',
  'COMMAND',
  'GATE',
  'CONDITION',
  'PARALLEL',
  'AGGREGATE',
  'DEBATE',
  'LOOP',
  'HUMAN',
  'SUBWORKFLOW',
]);
export type WorkflowNodeKind = z.infer<typeof workflowNodeKindSchema>;

export const workflowNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: workflowNodeKindSchema,
    role: z.string().min(1).optional(),
    maxIterations: z.number().int().positive().optional(),
  })
  .superRefine((node, ctx) => {
    if (node.kind === 'LOOP' && node.maxIterations === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'LOOP nodes must define maxIterations',
        path: ['maxIterations'],
      });
    }
  });

export const workflowSpecSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    nodes: z.array(workflowNodeSchema).min(1),
    edges: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      }),
    ),
  })
  .strict();
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;

export {
  buildDiagnosedUserErrorV1,
  buildRuntimeErrorDiagnosisV1,
  errorDiagnosisCanExposeRawCause,
  errorDiagnosisCanGrantAuthority,
  formatRuntimeErrorDiagnosisForUser,
  runtimeErrorCausalHopV1Schema,
  runtimeErrorCauseCertaintyV1Schema,
  runtimeErrorCauseKindV1Schema,
  runtimeErrorDiagnosisV1Schema,
  runtimeErrorSourceLayerV1Schema,
  unresolvedDiagnosisCanClaimSpecificRootCause,
  type BuildRuntimeErrorDiagnosisV1Input,
  type DiagnosedUserErrorV1,
  type RuntimeErrorCausalHopV1,
  type RuntimeErrorCauseCertaintyV1,
  type RuntimeErrorCauseKindV1,
  type RuntimeErrorDiagnosisV1,
  type RuntimeErrorSourceLayerV1,
} from './error-diagnosis.js';

export {
  autonomousMergeReviewV1Schema,
  buildUserFacingErrorV1,
  errorReportingCanGrantAuthority,
  getRuntimeErrorPatternDefinitionV1,
  candidateAdjudicationResultV1Schema,
  evidenceReferenceV1Schema,
  runtimeErrorClassV1Schema,
  runtimeErrorPatternCatalogV1,
  runtimeErrorReportV1Schema,
  runtimeErrorSeverityV1Schema,
  runtimeRetryabilityV1Schema,
  safeDetailV1Schema,
  malformedOutputCanBecomeSemanticApproval,
  parseStructuredRoleResultV1,
  resultBindingV1Schema,
  runtimeErrorCanExposeRawCause,
  runtimeErrorPattern,
  reviewResultV1Schema,
  structuredFindingV1Schema,
  userActionKindV1Schema,
  userErrorContextV1Schema,
  userFacingErrorCanContainSecrets,
  userFacingErrorV1Schema,
  userImpactV1Schema,
  structuredRoleResultCanGrantAuthority,
  structuredRoleResultIsSemanticNegative,
  structuredRoleResultV1Schema,
  testAdequacyResultV1Schema,
  type AutonomousMergeReviewV1,
  type BuildUserFacingErrorV1Input,
  type CandidateAdjudicationResultV1,
  type EvidenceReferenceV1,
  type MalformedStructuredRoleResult,
  type ResultBindingV1,
  type RuntimeErrorClassV1,
  type RuntimeErrorPatternDefinitionV1,
  type RuntimeErrorReportV1,
  type RuntimeErrorSeverityV1,
  type RuntimeRetryabilityV1,
  type SafeDetailV1,
  type ReviewResultV1,
  type StructuredFindingV1,
  type StructuredRoleParseResult,
  type StructuredRoleResultV1,
  type TestAdequacyResultV1,
  type UserActionKindV1,
  type UserErrorContextV1,
  type UserFacingErrorV1,
  type UserImpactV1,
  type ValidStructuredRoleResult,
} from './runtime-results.js';
