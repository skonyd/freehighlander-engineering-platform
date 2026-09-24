import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRegressionCorpus,
  promoteConfirmedMissToRegressionCase,
  regressionCorpusCanGrantAuthority,
  regressionCorpusStoresRawSensitiveContent,
  runRegressionCorpus,
} from '../dist/index.js';

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function source(overrides = {}) {
  return {
    caseId: 'source-case-1',
    role: 'security-candidate-reviewer',
    inputHash: 'a'.repeat(64),
    findings: [
      {
        key: 'missing-authz-check',
        severity: 'P1',
        label: 'MISSED_BY_CANDIDATE',
      },
    ],
    ...overrides,
  };
}

async function regressionCase(overrides = {}) {
  const sanitizedInput = 'sanitized regression fixture without secrets';
  return {
    sanitizedInput,
    case: await promoteConfirmedMissToRegressionCase({
      caseId: 'regression-case-1',
      source: source(),
      sourceFindingKey: 'missing-authz-check',
      adjudicated: true,
      riskTier: 'HIGH',
      sanitizedInputArtifactId: 'regression/artifact-1',
      sanitizedInputHash: await sha256(sanitizedInput),
      sanitizationAttestationHash: 'b'.repeat(64),
      evidenceHashes: ['d'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)],
      expectedFindingKey: 'missing-authz-check',
      ...overrides,
    }),
  };
}

test('confirmed P0/P1/P2 miss becomes deterministic metadata-only regression case', async () => {
  const first = await regressionCase();
  const second = await regressionCase();

  assert.deepEqual(first.case, second.case);
  assert.equal(first.case.severity, 'P1');
  assert.equal(first.case.expectedSeverity, 'P1');
  assert.deepEqual(first.case.evidenceHashes, ['c'.repeat(64), 'd'.repeat(64)]);
  assert.equal(first.case.authority, 'NONE');
  assert.equal(first.case.sourceFindingKeyHash.length, 64);
  assert.equal(JSON.stringify(first.case).includes(first.sanitizedInput), false);
  assert.equal(regressionCorpusCanGrantAuthority(), false);
  assert.equal(regressionCorpusStoresRawSensitiveContent(), false);
});

test('regression promotion fails closed unless miss is adjudicated serious and exact', async () => {
  const base = {
    caseId: 'regression-case-x',
    source: source(),
    sourceFindingKey: 'missing-authz-check',
    adjudicated: true,
    riskTier: 'HIGH',
    sanitizedInputArtifactId: 'regression/artifact-x',
    sanitizedInputHash: 'e'.repeat(64),
    sanitizationAttestationHash: 'f'.repeat(64),
    evidenceHashes: ['1'.repeat(64)],
    expectedFindingKey: 'missing-authz-check',
  };

  await assert.rejects(
    () => promoteConfirmedMissToRegressionCase({ ...base, adjudicated: false }),
    /adjudicated confirmation/,
  );

  await assert.rejects(
    () =>
      promoteConfirmedMissToRegressionCase({
        ...base,
        sourceFindingKey: 'unknown-key',
      }),
    /exactly one finding/,
  );

  await assert.rejects(
    () =>
      promoteConfirmedMissToRegressionCase({
        ...base,
        source: source({
          findings: [
            {
              key: 'missing-authz-check',
              severity: 'P1',
              label: 'CONFIRMED',
            },
          ],
        }),
      }),
    /candidate miss/,
  );

  await assert.rejects(
    () =>
      promoteConfirmedMissToRegressionCase({
        ...base,
        source: source({
          findings: [
            {
              key: 'missing-authz-check',
              severity: 'P3',
              label: 'MISSED_BY_CANDIDATE',
            },
          ],
        }),
      }),
    /P0\/P1\/P2/,
  );

  await assert.rejects(
    () => promoteConfirmedMissToRegressionCase({ ...base, evidenceHashes: [] }),
    /exact evidence hashes/,
  );

  await assert.rejects(
    () =>
      promoteConfirmedMissToRegressionCase({
        ...base,
        evidenceHashes: ['NOT-A-HASH'],
      }),
    /lowercase sha256/,
  );

  await assert.rejects(
    () =>
      promoteConfirmedMissToRegressionCase({
        ...base,
        expectedFindingKey: 'unsafe key with spaces',
      }),
    /machine-safe identifier/,
  );
});

test('regression corpus is sorted hash-bound versioned and rejects duplicate/tampered cases', async () => {
  const one = await regressionCase({ caseId: 'case-b' });
  const two = await regressionCase({
    caseId: 'case-a',
    source: source({
      caseId: 'source-case-2',
      findings: [
        {
          key: 'missing-authz-check',
          severity: 'P2',
          label: 'MISSED_BY_CANDIDATE',
        },
      ],
    }),
  });

  const corpus = await buildRegressionCorpus({
    version: '1.0.0',
    createdAt: '2026-09-24T20:00:00+00:00',
    cases: [one.case, two.case],
  });

  assert.deepEqual(
    corpus.cases.map((item) => item.caseId),
    ['case-a', 'case-b'],
  );
  assert.equal(corpus.createdAt, '2026-09-24T20:00:00.000Z');
  assert.equal(corpus.hash.length, 64);
  assert.equal(corpus.authority, 'NONE');

  await assert.rejects(
    () =>
      buildRegressionCorpus({
        version: '1.0.0',
        createdAt: '2026-09-24T20:00:00.000Z',
        cases: [one.case, one.case],
      }),
    /duplicate regression case/,
  );

  await assert.rejects(
    () =>
      buildRegressionCorpus({
        version: 'bad-version',
        createdAt: '2026-09-24T20:00:00.000Z',
        cases: [],
      }),
    /semantic x.y.z/,
  );

  await assert.rejects(
    () =>
      buildRegressionCorpus({
        version: '1.0.0',
        createdAt: 'not-a-date',
        cases: [],
      }),
    /ISO timestamp/,
  );

  await assert.rejects(
    () =>
      buildRegressionCorpus({
        version: '1.0.0',
        createdAt: '2026-09-24T20:00:00.000Z',
        cases: [{ ...one.case, model: 'tamper', expectedSeverity: 'P2' }],
      }),
    /expected severity mismatch|hash mismatch/,
  );
});

test('regression runner verifies artifact hash and exact expected finding before PASS', async () => {
  const fixture = await regressionCase();
  const corpus = await buildRegressionCorpus({
    version: '1.0.0',
    createdAt: '2026-09-24T20:00:00.000Z',
    cases: [fixture.case],
  });

  const worker = {
    binding: { id: 'candidate-v2', provider: 'local', model: 'reviewer-v2' },
    invoke: async () => ({
      findings: [{ key: 'missing-authz-check', severity: 'P1' }],
    }),
  };

  const report = await runRegressionCorpus({
    corpus,
    role: 'security-candidate-reviewer',
    worker,
    resolveSanitizedInput: async () => fixture.sanitizedInput,
  });

  assert.equal(report.totalCases, 1);
  assert.equal(report.passedCases, 1);
  assert.equal(report.passed, true);
  assert.equal(report.results[0].status, 'PASS');
  assert.equal(report.authority, 'NONE');
  assert.equal(report.hash.length, 64);
});

test('regression runner records fail invalid artifact and execution error without raw errors', async () => {
  const fixtures = [];
  for (const [caseId, artifactId] of [
    ['case-pass', 'artifact/pass'],
    ['case-fail', 'artifact/fail'],
    ['case-bad-hash', 'artifact/bad-hash'],
    ['case-resolver-error', 'artifact/resolver-error'],
    ['case-worker-error', 'artifact/worker-error'],
  ]) {
    const sanitizedInput = `sanitized-${caseId}`;
    fixtures.push({
      sanitizedInput,
      case: await promoteConfirmedMissToRegressionCase({
        caseId,
        source: source({ caseId: `source-${caseId}` }),
        sourceFindingKey: 'missing-authz-check',
        adjudicated: true,
        riskTier: 'HIGH',
        sanitizedInputArtifactId: artifactId,
        sanitizedInputHash: await sha256(sanitizedInput),
        sanitizationAttestationHash: '2'.repeat(64),
        evidenceHashes: ['3'.repeat(64)],
        expectedFindingKey: 'missing-authz-check',
      }),
    });
  }

  const corpus = await buildRegressionCorpus({
    version: '2.0.0',
    createdAt: '2026-09-24T20:30:00.000Z',
    cases: fixtures.map((item) => item.case),
  });
  const byArtifact = new Map(fixtures.map((item) => [item.case.sanitizedInputArtifactId, item]));

  const report = await runRegressionCorpus({
    corpus,
    role: 'security-candidate-reviewer',
    worker: {
      binding: { id: 'candidate', provider: 'p', model: 'm' },
      invoke: async (input) => {
        if (input.includes('worker-error')) throw new Error('sensitive worker failure');
        if (input.includes('fail')) return { findings: [], malformed: true };
        return { findings: [{ key: 'missing-authz-check', severity: 'P1' }] };
      },
    },
    resolveSanitizedInput: async (artifactId) => {
      if (artifactId === 'artifact/resolver-error') throw new Error('sensitive resolver failure');
      const item = byArtifact.get(artifactId);
      if (!item) throw new Error('missing fixture');
      return artifactId === 'artifact/bad-hash' ? 'wrong-content' : item.sanitizedInput;
    },
  });

  const statuses = Object.fromEntries(report.results.map((item) => [item.caseId, item.status]));
  assert.deepEqual(statuses, {
    'case-bad-hash': 'INVALID_ARTIFACT',
    'case-fail': 'FAIL',
    'case-pass': 'PASS',
    'case-resolver-error': 'INVALID_ARTIFACT',
    'case-worker-error': 'EXECUTION_ERROR',
  });
  assert.equal(report.passed, false);
  assert.equal(report.passedCases, 1);
  assert.equal(JSON.stringify(report).includes('sensitive'), false);
});

test('regression runner rejects tampered corpus and malformed binding identity', async () => {
  const fixture = await regressionCase();
  const corpus = await buildRegressionCorpus({
    version: '1.0.0',
    createdAt: '2026-09-24T21:00:00.000Z',
    cases: [fixture.case],
  });

  const base = {
    corpus,
    role: 'security-candidate-reviewer',
    worker: {
      binding: { id: 'candidate', provider: 'provider', model: 'model' },
      invoke: async () => ({ findings: [] }),
    },
    resolveSanitizedInput: async () => fixture.sanitizedInput,
  };

  await assert.rejects(
    () => runRegressionCorpus({ ...base, corpus: { ...corpus, hash: '0'.repeat(64) } }),
    /corpus hash mismatch/,
  );

  await assert.rejects(
    () =>
      runRegressionCorpus({
        ...base,
        worker: {
          ...base.worker,
          binding: { ...base.worker.binding, id: 'bad id' },
        },
      }),
    /machine-safe identifier/,
  );

  const noMatch = await runRegressionCorpus({ ...base, role: 'repo-analysis' });
  assert.equal(noMatch.totalCases, 0);
  assert.equal(noMatch.passed, true);
});
