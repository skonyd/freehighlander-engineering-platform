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
