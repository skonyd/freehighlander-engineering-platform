import {
  buildTestingSnapshot,
  type TestCase,
  type TestEvidenceKind,
  type TestPlan,
  type TestResult,
  type TestResultStatus,
  type TestRun,
  type TestingSnapshot,
  validateTestPlan,
  validateTestRun,
} from './index.js';

export interface TestCaseExecutionRequestV1 {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly caseId: string;
  readonly repository: string;
  readonly revision: string;
  readonly environmentId: string;
  readonly environmentFingerprint: string;
}

export interface TestCaseEvidencePayloadV1 {
  readonly id: string;
  readonly kind: TestEvidenceKind;
  readonly payload: string;
}

export interface TestCaseExecutionOutcomeV1 {
  readonly schemaVersion: 1;
  readonly status: TestResultStatus;
  readonly evidence: readonly TestCaseEvidencePayloadV1[];
  readonly durationMs?: number;
}

export interface TestCaseExecutorV1 {
  readonly id: string;
  execute(
    request: TestCaseExecutionRequestV1,
    testCase: TestCase,
  ): Promise<TestCaseExecutionOutcomeV1>;
}

export interface AuthoritativeTestRunOptionsV1 {
  readonly runId: string;
  readonly observedRevision: string;
  readonly observedEnvironmentFingerprint: string;
}

export interface AuthoritativeTestRunResultV1 {
  readonly schemaVersion: 1;
  readonly run: TestRun;
  readonly snapshot: TestingSnapshot;
  readonly executorId: string;
  readonly authority: 'NONE';
  readonly mergeAuthorized: false;
  readonly releaseAuthorized: false;
}

export async function runAuthoritativeTestPlanV1(
  plan: TestPlan,
  executor: TestCaseExecutorV1,
  options: AuthoritativeTestRunOptionsV1,
): Promise<AuthoritativeTestRunResultV1> {
  validateInputs(plan, executor, options);

  const results: TestResult[] = [];
  for (const testCase of plan.cases) {
    const request: TestCaseExecutionRequestV1 = {
      schemaVersion: 1,
      planId: plan.id,
      caseId: testCase.id,
      repository: plan.repository,
      revision: plan.revisionUnderTest,
      environmentId: plan.environment.id,
      environmentFingerprint: plan.environment.fingerprint,
    };

    let outcome: TestCaseExecutionOutcomeV1;
    try {
      outcome = await executor.execute(request, testCase);
      validateOutcome(outcome);
    } catch {
      outcome = {
        schemaVersion: 1,
        status: 'ERROR',
        evidence: [
          {
            id: 'executor-error-' + testCase.id,
            kind: 'LOG',
            payload: JSON.stringify({
              schemaVersion: 1,
              kind: 'EXECUTOR_ERROR',
              planId: plan.id,
              caseId: testCase.id,
              revision: plan.revisionUnderTest,
            }),
          },
        ],
      };
    }

    results.push({
      caseId: testCase.id,
      status: outcome.status,
      repository: plan.repository,
      revision: plan.revisionUnderTest,
      environmentFingerprint: plan.environment.fingerprint,
      evidence: await Promise.all(
        outcome.evidence.map(async (item) => ({
          id: item.id,
          kind: item.kind,
          digest: await sha256Hex(item.payload),
          provenance: 'TRUSTED' as const,
        })),
      ),
      ...(outcome.durationMs === undefined ? {} : { durationMs: outcome.durationMs }),
    });
  }

  const run: TestRun = {
    schemaVersion: 1,
    id: options.runId,
    planId: plan.id,
    repository: plan.repository,
    revision: plan.revisionUnderTest,
    environmentFingerprint: plan.environment.fingerprint,
    results,
  };
  const validation = validateTestRun(plan, run);
  if (!validation.valid) {
    throw new Error('authoritative test run validation failed: ' + validation.errors.join('; '));
  }

  return {
    schemaVersion: 1,
    run,
    snapshot: await buildTestingSnapshot(plan, run),
    executorId: executor.id,
    authority: 'NONE',
    mergeAuthorized: false,
    releaseAuthorized: false,
  };
}

export function authoritativeTestPassCanGrantAuthority(): false {
  return false;
}

export function authoritativeTestRunCanMutateProduction(): false {
  return false;
}

function validateInputs(
  plan: TestPlan,
  executor: TestCaseExecutorV1,
  options: AuthoritativeTestRunOptionsV1,
): void {
  const validation = validateTestPlan(plan);
  if (!validation.valid) throw new Error('invalid test plan: ' + validation.errors.join('; '));
  if (!executor || typeof executor.execute !== 'function') {
    throw new Error('test case executor is required');
  }
  requireIdentifier(executor.id, 'executor id');
  requireIdentifier(options.runId, 'runId');
  if (options.observedRevision !== plan.revisionUnderTest) {
    throw new Error('observed revision does not match test plan revision');
  }
  if (options.observedEnvironmentFingerprint !== plan.environment.fingerprint) {
    throw new Error('observed environment does not match test plan environment');
  }
}

function validateOutcome(outcome: TestCaseExecutionOutcomeV1): void {
  if (!outcome || outcome.schemaVersion !== 1) {
    throw new Error('invalid test execution outcome');
  }
  if (!['PASS', 'FAIL', 'ERROR', 'SKIPPED'].includes(outcome.status)) {
    throw new Error('invalid test execution status');
  }
  if (!Array.isArray(outcome.evidence)) throw new Error('test evidence must be an array');
  if (outcome.status !== 'SKIPPED' && outcome.evidence.length === 0) {
    throw new Error('non-skipped test result requires evidence');
  }
  if (
    outcome.durationMs !== undefined &&
    (!Number.isFinite(outcome.durationMs) || outcome.durationMs < 0)
  ) {
    throw new Error('durationMs must be non-negative');
  }
  const seen = new Set<string>();
  for (const item of outcome.evidence) {
    requireIdentifier(item.id, 'evidence id');
    if (seen.has(item.id)) throw new Error('duplicate evidence id');
    seen.add(item.id);
    if (!['LOG', 'REPORT', 'TRACE', 'SCREENSHOT', 'ARTIFACT'].includes(item.kind)) {
      throw new Error('invalid evidence kind');
    }
    if (typeof item.payload !== 'string' || item.payload.length > 1024 * 1024) {
      throw new Error('evidence payload must be a bounded string');
    }
  }
}

function requireIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value)) {
    throw new Error(field + ' must be a bounded identifier');
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
