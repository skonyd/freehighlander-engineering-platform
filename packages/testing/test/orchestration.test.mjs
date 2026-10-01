import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoritativeTestPassCanGrantAuthority,
  authoritativeTestRunCanMutateProduction,
  runAuthoritativeTestPlanV1,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const revision = 'a'.repeat(40);
const environmentFingerprint = 'b'.repeat(64);

const plan = {
  schemaVersion: 1,
  id: 'plan-1',
  revision: 1,
  developmentCandidateId: 'candidate-1',
  repository,
  revisionUnderTest: revision,
  environment: { id: 'node-linux', fingerprint: environmentFingerprint },
  requiredAcceptanceCriteria: ['AC-1'],
  cases: [
    {
      id: 'TC-1',
      title: 'Required test',
      kind: 'UNIT',
      required: true,
      acceptanceCriteria: ['AC-1'],
    },
  ],
};

const options = {
  runId: 'run-1',
  observedRevision: revision,
  observedEnvironmentFingerprint: environmentFingerprint,
};

test('authoritative runner hashes evidence and PASS remains authority-neutral', async () => {
  const executor = {
    id: 'runner-1',
    async execute(request, testCase) {
      assert.equal(request.revision, revision);
      assert.equal(request.environmentFingerprint, environmentFingerprint);
      assert.equal(testCase.id, 'TC-1');
      return {
        schemaVersion: 1,
        status: 'PASS',
        evidence: [{ id: 'E-1', kind: 'REPORT', payload: 'raw-test-output' }],
        durationMs: 12,
      };
    },
  };

  const result = await runAuthoritativeTestPlanV1(plan, executor, options);
  assert.equal(result.run.results[0].status, 'PASS');
  assert.match(result.run.results[0].evidence[0].digest, /^[a-f0-9]{64}$/);
  assert.notEqual(result.run.results[0].evidence[0].digest, 'raw-test-output');
  assert.equal(result.run.results[0].evidence[0].provenance, 'TRUSTED');
  assert.equal(result.snapshot.status, 'PASS');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.mergeAuthorized, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(authoritativeTestPassCanGrantAuthority(), false);
  assert.equal(authoritativeTestRunCanMutateProduction(), false);
});

test('revision and environment drift fail before executor invocation', async () => {
  let calls = 0;
  const executor = {
    id: 'runner-1',
    async execute() {
      calls += 1;
      throw new Error('should not run');
    },
  };

  await assert.rejects(
    () =>
      runAuthoritativeTestPlanV1(plan, executor, {
        ...options,
        observedRevision: 'c'.repeat(40),
      }),
    /observed revision/,
  );
  await assert.rejects(
    () =>
      runAuthoritativeTestPlanV1(plan, executor, {
        ...options,
        observedEnvironmentFingerprint: 'different',
      }),
    /observed environment/,
  );
  assert.equal(calls, 0);
});

test('executor errors become digest-bound ERROR evidence without raw cause leakage', async () => {
  const result = await runAuthoritativeTestPlanV1(
    plan,
    {
      id: 'throwing-runner',
      async execute() {
        throw new Error('SECRET raw executor failure');
      },
    },
    options,
  );

  assert.equal(result.run.results[0].status, 'ERROR');
  assert.equal(result.snapshot.status, 'FAIL');
  assert.match(result.run.results[0].evidence[0].digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET raw executor failure/);
});

test('SKIPPED may omit evidence and produces insufficient evidence', async () => {
  const result = await runAuthoritativeTestPlanV1(
    plan,
    {
      id: 'skip-runner',
      async execute() {
        return { schemaVersion: 1, status: 'SKIPPED', evidence: [] };
      },
    },
    options,
  );

  assert.equal(result.run.results[0].status, 'SKIPPED');
  assert.deepEqual(result.run.results[0].evidence, []);
  assert.equal(result.snapshot.status, 'INSUFFICIENT_EVIDENCE');
});

test('malformed executor outcomes fail closed into ERROR evidence', async () => {
  const outcomes = [
    null,
    { schemaVersion: 2, status: 'PASS', evidence: [] },
    { schemaVersion: 1, status: 'UNKNOWN', evidence: [] },
    { schemaVersion: 1, status: 'PASS', evidence: null },
    { schemaVersion: 1, status: 'PASS', evidence: [] },
    { schemaVersion: 1, status: 'PASS', evidence: [{ id: '!', kind: 'LOG', payload: 'x' }] },
    {
      schemaVersion: 1,
      status: 'PASS',
      evidence: [
        { id: 'E-1', kind: 'LOG', payload: 'x' },
        { id: 'E-1', kind: 'LOG', payload: 'y' },
      ],
    },
    {
      schemaVersion: 1,
      status: 'PASS',
      evidence: [{ id: 'E-1', kind: 'INVALID', payload: 'x' }],
    },
    {
      schemaVersion: 1,
      status: 'PASS',
      evidence: [{ id: 'E-1', kind: 'LOG', payload: 3 }],
    },
    {
      schemaVersion: 1,
      status: 'PASS',
      evidence: [{ id: 'E-1', kind: 'LOG', payload: 'x'.repeat(1024 * 1024 + 1) }],
    },
    {
      schemaVersion: 1,
      status: 'PASS',
      evidence: [{ id: 'E-1', kind: 'LOG', payload: 'x' }],
      durationMs: -1,
    },
  ];

  for (const outcome of outcomes) {
    const result = await runAuthoritativeTestPlanV1(
      plan,
      { id: 'bad-runner', async execute() { return outcome; } },
      options,
    );
    assert.equal(result.run.results[0].status, 'ERROR');
  }
});

test('invalid plan runner identity and run identity are rejected', async () => {
  const executor = {
    id: 'runner-1',
    async execute() {
      return {
        schemaVersion: 1,
        status: 'PASS',
        evidence: [{ id: 'E-1', kind: 'LOG', payload: 'x' }],
      };
    },
  };

  await assert.rejects(() => runAuthoritativeTestPlanV1({ ...plan, id: '' }, executor, options));
  await assert.rejects(() => runAuthoritativeTestPlanV1(plan, null, options));
  await assert.rejects(() =>
    runAuthoritativeTestPlanV1(plan, { id: 'runner', execute: null }, options),
  );
  await assert.rejects(() =>
    runAuthoritativeTestPlanV1(plan, { ...executor, id: '!' }, options),
  );
  await assert.rejects(() =>
    runAuthoritativeTestPlanV1(plan, executor, { ...options, runId: '!' }),
  );
});
