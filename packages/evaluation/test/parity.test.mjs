import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShadowParityReport,
  parityCanCutOverV3,
  parityCanGrantAuthority,
} from '../dist/index.js';

const base = {
  caseId: 'case-1',
  referenceRepository: 'skonyd/creator-marketplace',
  referenceSha: '0e70f4a9680fcc5c287b7926f2aa20170c79f47d',
  referenceStatus: 'PROVISIONAL',
  binding: {
    repository: 'skonyd/freehighlander-engineering-platform',
    headSha: 'head-1',
    workflowHash: 'workflow-1',
    policyHash: 'policy-1',
    artifactRootHash: 'artifact-root-1',
    authoritativeInputHash: 'input-1',
  },
  v2: {
    route: 'astra-medium',
    gate: 'PASS',
    artifact: 'full',
    state: 'COMPLETED',
    failure: 'none',
    outcome: 'PASS',
  },
  v3: {
    route: 'astra-medium',
    gate: 'PASS',
    artifact: 'full',
    state: 'COMPLETED',
    failure: 'none',
    outcome: 'PASS',
  },
};

test('identical V2/V3 observations produce deterministic PASS without authority', async () => {
  const first = await buildShadowParityReport(base);
  const second = await buildShadowParityReport(base);

  assert.equal(first.status, 'PASS');
  assert.equal(first.caseHash, second.caseHash);
  assert.equal(first.referenceStatus, 'PROVISIONAL');
  assert.equal(first.authorityGranted, false);
  assert.equal(first.cutoverAllowed, false);
  assert.equal(parityCanGrantAuthority(), false);
  assert.equal(parityCanCutOverV3(), false);
  assert.equal(
    first.dimensions.every((entry) => entry.status === 'MATCH'),
    true,
  );
});

test('mismatch identifies exact dimensions and remains non-authoritative', async () => {
  const report = await buildShadowParityReport({
    ...base,
    v3: {
      ...base.v3,
      route: 'sonnet-medium',
      outcome: 'WARN',
    },
  });

  assert.equal(report.status, 'MISMATCH');
  assert.deepEqual(
    report.dimensions
      .filter((entry) => entry.status === 'MISMATCH')
      .map((entry) => entry.dimension),
    ['route', 'outcome'],
  );
  assert.equal(report.cutoverAllowed, false);
});

test('missing evidence is insufficient rather than parity', async () => {
  const report = await buildShadowParityReport({
    ...base,
    v3: {
      ...base.v3,
      artifact: undefined,
    },
  });

  assert.equal(report.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(
    report.dimensions.find((entry) => entry.dimension === 'artifact')?.status,
    'MISSING_EVIDENCE',
  );
});

test('excluded and unavailable cases are accounted explicitly', async () => {
  const excluded = await buildShadowParityReport({
    ...base,
    excludedReason: 'synthetic fixture',
  });
  const unavailable = await buildShadowParityReport({
    ...base,
    unavailableReason: 'reference provider unavailable',
  });

  assert.equal(excluded.status, 'EXCLUDED');
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal(excluded.dimensions.length, 0);
  assert.equal(unavailable.dimensions.length, 0);
});

test('exact binding changes case identity', async () => {
  const original = await buildShadowParityReport(base);
  const changed = await buildShadowParityReport({
    ...base,
    binding: { ...base.binding, headSha: 'head-2' },
  });

  assert.notEqual(original.caseHash, changed.caseHash);
});

test('malformed case metadata fails closed', async () => {
  await assert.rejects(
    () =>
      buildShadowParityReport({
        ...base,
        referenceSha: '',
      }),
    /referenceSha is required/,
  );

  await assert.rejects(
    () =>
      buildShadowParityReport({
        ...base,
        excludedReason: 'fixture',
        unavailableReason: 'provider down',
      }),
    /both excluded and unavailable/,
  );
});
