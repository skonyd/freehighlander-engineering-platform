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
export type CandidateAdjudicationResultV1 = z.infer<
  typeof candidateAdjudicationResultV1Schema
>;
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
