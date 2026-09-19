import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHADOW_ROLES,
  reconcileShadowPair,
  runIndependentShadowPair,
  shadowCanGrantAuthority,
} from '../dist/index.js';

function worker(binding, opinion, calls) {
  return {
    binding,
    async invoke(input) {
      calls.push({ binding: binding.id, input });
      return opinion;
    },
  };
}

test('candidate and reference receive identical input independently and cannot grant authority', async () => {
  const calls = [];
  let clock = 100;
  const pair = await runIndependentShadowPair({
    caseId: 'case-1',
    role: 'repo-analysis',
    authoritativeInput: 'same packet',
    candidate: worker(
      {
        id: 'qwen-local',
        provider: 'openai-compatible',
        model: 'qwen3.8-flash-next',
        independenceKey: 'local-qwen',
      },
      { findings: [] },
      calls,
    ),
    reference: worker(
      {
        id: 'astra-reference',
        provider: 'openai',
        model: 'gpt-6-astra',
        independenceKey: 'remote-astra',
      },
      { findings: [] },
      calls,
    ),
    now: () => clock++,
  });

  assert.deepEqual(
    calls.map((call) => call.input),
    ['same packet', 'same packet'],
  );
  assert.equal(pair.candidate.inputHash, pair.reference.inputHash);
  assert.equal(pair.authority, 'NONE');
  assert.equal(shadowCanGrantAuthority(), false);
});

test('identical independence keys are rejected before either worker runs', async () => {
  const calls = [];
  const binding = {
    id: 'same',
    provider: 'x',
    model: 'x',
    independenceKey: 'shared',
  };

  await assert.rejects(
    () =>
      runIndependentShadowPair({
        caseId: 'case-1',
        role: 'repo-analysis',
        authoritativeInput: 'packet',
        candidate: worker(binding, { findings: [] }, calls),
        reference: worker(binding, { findings: [] }, calls),
      }),
    /different independence keys/,
  );
  assert.equal(calls.length, 0);
});

test('reconciliation labels confirmed, false-positive and serious misses', async () => {
  const calls = [];
  const pair = await runIndependentShadowPair({
    caseId: 'case-2',
    role: 'security-candidate-reviewer',
    authoritativeInput: 'security packet',
    candidate: worker(
      {
        id: 'qwen',
        provider: 'local',
        model: 'qwen',
        independenceKey: 'candidate',
      },
      {
        findings: [
          { key: 'shared', severity: 'P2', summary: 'shared' },
          { key: 'candidate-only', severity: 'P3', summary: 'fp' },
        ],
      },
      calls,
    ),
    reference: worker(
      {
        id: 'reference',
        provider: 'remote',
        model: 'strong',
        independenceKey: 'reference',
      },
      {
        findings: [
          { key: 'shared', severity: 'P2', summary: 'shared' },
          { key: 'missed-critical', severity: 'P1', summary: 'critical' },
          { key: 'missed-p2', severity: 'P2', summary: 'p2' },
        ],
      },
      calls,
    ),
  });

  const result = reconcileShadowPair(pair);
  assert.equal(result.agreement, false);
  assert.equal(result.confirmed, 1);
  assert.equal(result.falsePositive, 1);
  assert.equal(result.p0p1Miss, 1);
  assert.equal(result.p2Miss, 1);
  assert.equal(result.promotionAuthority, 'NONE');
});

test('failed shadow side becomes unresolved instead of authority fallback', async () => {
  const pair = await runIndependentShadowPair({
    caseId: 'case-3',
    role: 'test-candidate-reviewer',
    authoritativeInput: 'test packet',
    candidate: {
      binding: {
        id: 'qwen',
        provider: 'local',
        model: 'qwen',
        independenceKey: 'candidate',
      },
      async invoke() {
        throw new Error('timeout');
      },
    },
    reference: {
      binding: {
        id: 'reference',
        provider: 'remote',
        model: 'strong',
        independenceKey: 'reference',
      },
      async invoke() {
        return { findings: [] };
      },
    },
  });

  const result = reconcileShadowPair(pair);
  assert.equal(pair.candidate.status, 'REJECTED');
  assert.equal(
    result.findings.some((finding) => finding.label === 'UNRESOLVED'),
    true,
  );
  assert.equal(result.agreement, false);
});

test('initial shadow role registry stays bounded to non-authoritative specialists', () => {
  assert.deepEqual(SHADOW_ROLES, [
    'repo-analysis',
    'test-candidate-reviewer',
    'security-candidate-reviewer',
    'architecture-consistency-reviewer',
    'cve-dependency-triage',
  ]);
});


function reconciliation({
  role = 'repo-analysis',
  agreement = true,
  confirmed = 1,
  falsePositive = 0,
  p0p1Miss = 0,
  p2Miss = 0,
  malformedCandidate = false,
  findings = [],
} = {}) {
  return {
    caseId: 'case',
    role,
    inputHash: 'hash',
    agreement,
    malformedCandidate,
    malformedReference: false,
    confirmed,
    falsePositive,
    p0p1Miss,
    p2Miss,
    findings,
    promotionAuthority: 'NONE',
  };
}

function benchmarkSample(index, overrides = {}) {
  return {
    sampleId: `sample-${index}`,
    role: 'repo-analysis',
    riskTier: 'NORMAL',
    adjudicated: true,
    synthetic: false,
    reconciliation: reconciliation(),
    candidateLatencyMs: 100 + index,
    referenceLatencyMs: 300 + index,
    candidateTotalTokens: 100,
    referenceTotalTokens: 200,
    candidateCostUsd: 0.5,
    referenceCostUsd: 1,
    ...overrides,
  };
}

test('benchmark report excludes synthetic and unadjudicated samples from promotion metrics', async () => {
  const { buildBenchmarkReport } = await import('../dist/index.js');
  const samples = [
    ...Array.from({ length: 50 }, (_, index) => benchmarkSample(index)),
    benchmarkSample(100, { synthetic: true }),
    benchmarkSample(101, { adjudicated: false }),
  ];

  const report = buildBenchmarkReport(samples, 'repo-analysis', 'NORMAL');
  assert.equal(report.totalSamples, 52);
  assert.equal(report.eligibleSamples, 50);
  assert.equal(report.excludedSamples, 2);
  assert.equal(report.agreementRate, 1);
  assert.equal(report.projectedCostSavingRatio, 0.5);
  assert.equal(report.candidateLatencyP50Ms, 124);
  assert.equal(report.candidateLatencyP95Ms, 147);
});

test('NORMAL report can become PROMOTION_CANDIDATE but never grants authority', async () => {
  const { buildBenchmarkReport, promotionCanApplyAutomatically, screenPromotionCandidate } =
    await import('../dist/index.js');

  const samples = Array.from({ length: 50 }, (_, index) =>
    benchmarkSample(index, {
      reconciliation:
        index < 48
          ? reconciliation()
          : reconciliation({
              agreement: false,
              confirmed: 1,
              falsePositive: 1,
              findings: [
                {
                  key: `fp-${index}`,
                  severity: 'P3',
                  label: 'FALSE_POSITIVE',
                },
              ],
            }),
    }),
  );

  const report = buildBenchmarkReport(samples, 'repo-analysis', 'NORMAL');
  assert.equal(report.agreementRate, 0.96);
  const screening = screenPromotionCandidate(report);
  assert.equal(screening.status, 'PROMOTION_CANDIDATE');
  assert.equal(screening.authorityGranted, false);
  assert.equal(promotionCanApplyAutomatically(), false);
});

test('P0/P1 miss blocks promotion even when sample and agreement floors pass', async () => {
  const { buildBenchmarkReport, screenPromotionCandidate } = await import('../dist/index.js');
  const samples = Array.from({ length: 50 }, (_, index) =>
    benchmarkSample(index, {
      reconciliation:
        index === 0
          ? reconciliation({
              agreement: false,
              confirmed: 1,
              p0p1Miss: 1,
              findings: [
                {
                  key: 'critical-miss',
                  severity: 'P1',
                  label: 'MISSED_BY_CANDIDATE',
                },
              ],
            })
          : reconciliation(),
    }),
  );

  const report = buildBenchmarkReport(samples, 'repo-analysis', 'NORMAL');
  assert.equal(report.agreementRate, 0.98);
  assert.equal(report.p0p1Misses, 1);
  assert.equal(screenPromotionCandidate(report).status, 'BLOCKED');
});

test('HIGH requires 100 samples, 97% agreement and regression suite PASS', async () => {
  const { buildBenchmarkReport, screenPromotionCandidate } = await import('../dist/index.js');
  const samples = Array.from({ length: 100 }, (_, index) =>
    benchmarkSample(index, {
      riskTier: 'HIGH',
      reconciliation:
        index < 97
          ? reconciliation()
          : reconciliation({
              agreement: false,
              confirmed: 1,
              falsePositive: 1,
              findings: [
                {
                  key: `high-fp-${index}`,
                  severity: 'P3',
                  label: 'FALSE_POSITIVE',
                },
              ],
            }),
    }),
  );

  const report = buildBenchmarkReport(samples, 'repo-analysis', 'HIGH');
  assert.equal(report.agreementRate, 0.97);
  assert.equal(
    screenPromotionCandidate(report, { regressionSuitePassed: false }).status,
    'BLOCKED',
  );
  assert.equal(
    screenPromotionCandidate(report, { regressionSuitePassed: true }).status,
    'PROMOTION_CANDIDATE',
  );

  const shortReport = buildBenchmarkReport(samples.slice(0, 99), 'repo-analysis', 'HIGH');
  assert.equal(
    screenPromotionCandidate(shortReport, { regressionSuitePassed: true }).status,
    'INSUFFICIENT_DATA',
  );
});

test('CRITICAL benchmark always requires human/policy and never grants authority', async () => {
  const { buildBenchmarkReport, screenPromotionCandidate } = await import('../dist/index.js');
  const samples = Array.from({ length: 150 }, (_, index) =>
    benchmarkSample(index, { riskTier: 'CRITICAL' }),
  );

  const screening = screenPromotionCandidate(
    buildBenchmarkReport(samples, 'repo-analysis', 'CRITICAL'),
  );
  assert.equal(screening.status, 'HUMAN_POLICY_REQUIRED');
  assert.equal(screening.authorityGranted, false);
});
