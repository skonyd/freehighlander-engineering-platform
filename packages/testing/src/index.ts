export type TestCaseKind = 'UNIT' | 'INTEGRATION' | 'E2E' | 'CONTRACT' | 'MANUAL';
export type TestResultStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';
export type TestEvidenceKind = 'LOG' | 'REPORT' | 'TRACE' | 'SCREENSHOT' | 'ARTIFACT';
export type TestEvidenceProvenance = 'TRUSTED' | 'UNTRUSTED';
export type ShadowTestGateStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT_EVIDENCE';

export interface TestEnvironment {
  readonly id: string;
  readonly fingerprint: string;
}

export interface TestCase {
  readonly id: string;
  readonly title: string;
  readonly kind: TestCaseKind;
  readonly required: boolean;
  readonly acceptanceCriteria: readonly string[];
}

export interface TestPlan {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly developmentCandidateId: string;
  readonly repository: string;
  readonly revisionUnderTest: string;
  readonly environment: TestEnvironment;
  readonly requiredAcceptanceCriteria: readonly string[];
  readonly cases: readonly TestCase[];
}

export interface TestEvidence {
  readonly id: string;
  readonly kind: TestEvidenceKind;
  readonly digest: string;
  readonly provenance: TestEvidenceProvenance;
}

export interface TestResult {
  readonly caseId: string;
  readonly status: TestResultStatus;
  readonly repository: string;
  readonly revision: string;
  readonly environmentFingerprint: string;
  readonly evidence: readonly TestEvidence[];
  readonly durationMs?: number;
}

export interface TestRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly planId: string;
  readonly repository: string;
  readonly revision: string;
  readonly environmentFingerprint: string;
  readonly results: readonly TestResult[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ShadowTestGateEvaluation {
  readonly status: ShadowTestGateStatus;
  readonly reasons: readonly string[];
  readonly requiredCases: number;
  readonly passedRequiredCases: number;
  readonly requiredAcceptanceCriteria: number;
  readonly coveredAcceptanceCriteria: number;
  readonly authority: 'NONE';
  readonly mergeAuthorized: false;
  readonly releaseAuthorized: false;
  readonly promotionAuthorized: false;
}

export interface TestingSnapshot extends ShadowTestGateEvaluation {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly runId: string;
  readonly repository: string;
  readonly revision: string;
  readonly environmentFingerprint: string;
  readonly snapshotHash: string;
}

export function validateTestPlan(plan: TestPlan): ValidationResult {
  const errors: string[] = [];

  if (plan.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(plan.id, 'id', errors);
  requireText(plan.developmentCandidateId, 'developmentCandidateId', errors);
  requireText(plan.repository, 'repository', errors);
  requireText(plan.revisionUnderTest, 'revisionUnderTest', errors);
  requireText(plan.environment.id, 'environment.id', errors);
  requireText(plan.environment.fingerprint, 'environment.fingerprint', errors);

  if (!Number.isInteger(plan.revision) || plan.revision < 1) {
    errors.push('revision must be a positive integer');
  }

  const criterionIds = uniqueNonEmpty(
    plan.requiredAcceptanceCriteria,
    'acceptance criterion',
    errors,
  );
  const caseIds = uniqueNonEmpty(
    plan.cases.map((testCase) => testCase.id),
    'test case id',
    errors,
  );

  if (criterionIds.size === 0) errors.push('test plan requires acceptance criteria');
  if (caseIds.size === 0) errors.push('test plan requires test cases');

  const coveredCriteria = new Set<string>();
  for (const testCase of plan.cases) {
    requireText(testCase.id, 'test case id', errors);
    requireText(testCase.title, `test case ${testCase.id || '<missing>'} title`, errors);

    const mappedCriteria = uniqueNonEmpty(
      testCase.acceptanceCriteria,
      `test case ${testCase.id || '<missing>'} acceptance criterion`,
      errors,
    );
    for (const criterionId of mappedCriteria) {
      if (!criterionIds.has(criterionId)) {
        errors.push(
          `test case ${testCase.id} references unknown acceptance criterion ${criterionId}`,
        );
      } else if (testCase.required) {
        coveredCriteria.add(criterionId);
      }
    }
  }

  for (const criterionId of criterionIds) {
    if (!coveredCriteria.has(criterionId)) {
      errors.push(`acceptance criterion ${criterionId} lacks required test coverage`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateTestRun(plan: TestPlan, run: TestRun): ValidationResult {
  const planValidation = validateTestPlan(plan);
  const errors = [...planValidation.errors];

  if (run.schemaVersion !== 1) errors.push('unsupported test run schemaVersion');
  requireText(run.id, 'run id', errors);
  requireText(run.planId, 'run planId', errors);
  requireText(run.repository, 'run repository', errors);
  requireText(run.revision, 'run revision', errors);
  requireText(run.environmentFingerprint, 'run environmentFingerprint', errors);

  if (run.planId !== plan.id) errors.push('run planId must match test plan id');
  if (run.repository !== plan.repository) {
    errors.push('run repository must match test plan repository');
  }
  if (run.revision !== plan.revisionUnderTest) {
    errors.push('run revision must match test plan revisionUnderTest');
  }
  if (run.environmentFingerprint !== plan.environment.fingerprint) {
    errors.push('run environmentFingerprint must match test plan environment');
  }

  const knownCases = new Set(plan.cases.map((testCase) => testCase.id));
  uniqueNonEmpty(
    run.results.map((result) => result.caseId),
    'test result case id',
    errors,
  );

  for (const result of run.results) {
    if (!knownCases.has(result.caseId)) {
      errors.push(`test result references unknown case ${result.caseId}`);
    }
    if (result.repository !== plan.repository) {
      errors.push(`test result ${result.caseId} repository must match test plan repository`);
    }
    if (result.revision !== plan.revisionUnderTest) {
      errors.push(`test result ${result.caseId} revision must match revisionUnderTest`);
    }
    if (result.environmentFingerprint !== plan.environment.fingerprint) {
      errors.push(`test result ${result.caseId} environment must match test plan environment`);
    }
    if (
      result.durationMs !== undefined &&
      (!Number.isFinite(result.durationMs) || result.durationMs < 0)
    ) {
      errors.push(`test result ${result.caseId} durationMs must be non-negative`);
    }

    uniqueNonEmpty(
      result.evidence.map((evidence) => evidence.id),
      `test result ${result.caseId} evidence id`,
      errors,
    );
    if (result.status !== 'SKIPPED' && result.evidence.length === 0) {
      errors.push(`test result ${result.caseId} requires evidence`);
    }
    for (const evidence of result.evidence) {
      if (!/^[a-f0-9]{64}$/.test(evidence.digest)) {
        errors.push(`test evidence ${evidence.id} digest must be lowercase sha256`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function evaluateShadowTestGate(plan: TestPlan, run: TestRun): ShadowTestGateEvaluation {
  const validation = validateTestRun(plan, run);
  if (!validation.valid) {
    throw new Error(`invalid test evidence: ${validation.errors.join('; ')}`);
  }

  const resultByCase = new Map(run.results.map((result) => [result.caseId, result]));
  const requiredCases = plan.cases.filter((testCase) => testCase.required);
  const reasons: string[] = [];
  let passedRequiredCases = 0;

  for (const testCase of requiredCases) {
    const result = resultByCase.get(testCase.id);
    if (!result) {
      reasons.push(`missing required result: ${testCase.id}`);
      continue;
    }
    if (result.status === 'PASS') {
      passedRequiredCases += 1;
      continue;
    }
    if (result.status === 'FAIL' || result.status === 'ERROR') {
      reasons.push(`required test ${testCase.id} is ${result.status}`);
      continue;
    }
    reasons.push(`required test ${testCase.id} is SKIPPED`);
  }

  const coveredAcceptanceCriteria = new Set<string>();
  for (const testCase of requiredCases) {
    if (resultByCase.get(testCase.id)?.status !== 'PASS') continue;
    for (const criterionId of testCase.acceptanceCriteria) {
      coveredAcceptanceCriteria.add(criterionId);
    }
  }

  for (const criterionId of plan.requiredAcceptanceCriteria) {
    if (!coveredAcceptanceCriteria.has(criterionId)) {
      reasons.push(`acceptance criterion lacks passing evidence: ${criterionId}`);
    }
  }

  const hasFailure = requiredCases.some((testCase) => {
    const status = resultByCase.get(testCase.id)?.status;
    return status === 'FAIL' || status === 'ERROR';
  });
  const complete =
    passedRequiredCases === requiredCases.length &&
    coveredAcceptanceCriteria.size === plan.requiredAcceptanceCriteria.length;

  return {
    status: hasFailure ? 'FAIL' : complete ? 'PASS' : 'INSUFFICIENT_EVIDENCE',
    reasons,
    requiredCases: requiredCases.length,
    passedRequiredCases,
    requiredAcceptanceCriteria: plan.requiredAcceptanceCriteria.length,
    coveredAcceptanceCriteria: coveredAcceptanceCriteria.size,
    authority: 'NONE',
    mergeAuthorized: false,
    releaseAuthorized: false,
    promotionAuthorized: false,
  };
}

export async function buildTestingSnapshot(plan: TestPlan, run: TestRun): Promise<TestingSnapshot> {
  const evaluation = evaluateShadowTestGate(plan, run);
  const snapshotHash = await sha256Hex(canonicalJson({ plan, run }));

  return {
    schemaVersion: 1,
    planId: plan.id,
    runId: run.id,
    repository: plan.repository,
    revision: plan.revisionUnderTest,
    environmentFingerprint: plan.environment.fingerprint,
    snapshotHash,
    ...evaluation,
  };
}

export function testingCanGrantAuthority(): false {
  return false;
}

export function testPassCanAuthorizeMerge(): false {
  return false;
}

export function testPassCanAuthorizeRelease(): false {
  return false;
}

export function testingCanExecuteProductionMutation(): false {
  return false;
}

function uniqueNonEmpty(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      errors.push(`${kind} must not be empty`);
      continue;
    }
    if (seen.has(value)) errors.push(`duplicate ${kind}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
