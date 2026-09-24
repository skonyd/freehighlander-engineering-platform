import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalExecutionScope,
  buildNodeExecutionIdentity,
  createNodeResultV1,
  evaluateMandatoryJoin,
  evaluateNodeResultReuse,
  nodeResultReuseCanGrantAuthority,
  semanticNegativeCanTriggerModelShopping,
} from '../dist/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const H3 = '3'.repeat(64);
const H4 = '4'.repeat(64);
const H5 = '5'.repeat(64);
const H6 = '6'.repeat(64);
const H7 = '7'.repeat(64);
const H8 = '8'.repeat(64);
const H9 = '9'.repeat(64);
const HA = 'a'.repeat(64);
const HB = 'b'.repeat(64);
const HC = 'c'.repeat(64);

function scopeInput(overrides = {}) {
  return {
    repositoryIdentity: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'abc123',
    runSnapshotHash: H1,
    components: {
      task: H2,
      diff: H3,
      configuration: H4,
    },
    ...overrides,
  };
}

function identityInput(overrides = {}) {
  return {
    runSnapshotHash: H1,
    nodeId: 'review-001',
    nodeVersion: '1.0.0',
    exactRevision: 'abc123',
    scopeHash: H2,
    inputHash: H3,
    roleContractHash: H4,
    promptContractHash: H5,
    bindingId: 'binding-001',
    providerId: 'provider-001',
    modelId: 'model-001',
    effort: 'medium',
    policyHash: H6,
    configHash: H7,
    predecessorResultHashes: [H9, H8],
    artifactHashes: [HB, HA],
    ...overrides,
  };
}

function result(identity, overrides = {}) {
  return createNodeResultV1({
    identity,
    status: 'SUCCEEDED',
    outputHash: HC,
    artifactHashes: [HA],
    ...overrides,
  });
}

test('canonical execution scope is deterministic and component-bound', () => {
  const first = buildCanonicalExecutionScope(scopeInput());
  const second = buildCanonicalExecutionScope(
    scopeInput({
      components: {
        configuration: H4,
        diff: H3,
        task: H2,
      },
    }),
  );

  assert.deepEqual(first, second);
  assert.match(first.scopeHash, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');

  const changed = buildCanonicalExecutionScope(
    scopeInput({ components: { task: H2, diff: H3, configuration: H5 } }),
  );
  assert.notEqual(changed.scopeHash, first.scopeHash);

  for (const invalid of [
    scopeInput({ repositoryIdentity: ' ' }),
    scopeInput({ exactRevision: '' }),
    scopeInput({ runSnapshotHash: 'bad' }),
    scopeInput({ components: {} }),
    scopeInput({ components: { x: H2 } }),
    scopeInput({ components: { 'bad/name': H2 } }),
    scopeInput({ components: { task: 'bad' } }),
  ]) {
    assert.throws(() => buildCanonicalExecutionScope(invalid));
  }
});

test('node execution identity is order-independent and exact-bound', () => {
  const first = buildNodeExecutionIdentity(identityInput());
  const second = buildNodeExecutionIdentity(
    identityInput({
      predecessorResultHashes: [H8, H9],
      artifactHashes: [HA, HB],
    }),
  );

  assert.deepEqual(first, second);
  assert.deepEqual(first.predecessorResultHashes, [H8, H9]);
  assert.deepEqual(first.artifactHashes, [HA, HB]);
  assert.match(first.executionKey, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');

  const dimensions = [
    { exactRevision: 'def456' },
    { scopeHash: H3 },
    { inputHash: H4 },
    { roleContractHash: H5 },
    { promptContractHash: H6 },
    { bindingId: 'binding-002' },
    { providerId: 'provider-002' },
    { modelId: 'model-002' },
    { effort: 'high' },
    { policyHash: H7 },
    { configHash: H8 },
    { predecessorResultHashes: [H8] },
    { artifactHashes: [HA] },
  ];

  for (const changed of dimensions) {
    const next = buildNodeExecutionIdentity(identityInput(changed));
    assert.notEqual(next.executionKey, first.executionKey);
  }
});

test('node identity validation rejects malformed and duplicate exact inputs', () => {
  for (const invalid of [
    identityInput({ runSnapshotHash: 'bad' }),
    identityInput({ nodeId: 'x' }),
    identityInput({ nodeVersion: ' ' }),
    identityInput({ exactRevision: '' }),
    identityInput({ scopeHash: 'bad' }),
    identityInput({ inputHash: 'bad' }),
    identityInput({ roleContractHash: 'bad' }),
    identityInput({ promptContractHash: 'bad' }),
    identityInput({ bindingId: 'x' }),
    identityInput({ providerId: 'x' }),
    identityInput({ modelId: 'x' }),
    identityInput({ effort: 'x' }),
    identityInput({ policyHash: 'bad' }),
    identityInput({ configHash: 'bad' }),
    identityInput({ predecessorResultHashes: [H8, H8] }),
    identityInput({ artifactHashes: [HA, HA] }),
  ]) {
    assert.throws(() => buildNodeExecutionIdentity(invalid));
  }
});

test('immutable node result hash binds status output artifacts and idempotency evidence', () => {
  const identity = buildNodeExecutionIdentity(identityInput());
  const first = result(identity);
  const second = result(identity);

  assert.deepEqual(first, second);
  assert.equal(first.status, 'SUCCEEDED');
  assert.equal(first.idempotencyEvidenceHash, null);
  assert.match(first.resultHash, /^[a-f0-9]{64}$/);
  assert.equal(first.authority, 'NONE');

  const withEvidence = result(identity, { idempotencyEvidenceHash: H2 });
  assert.notEqual(withEvidence.resultHash, first.resultHash);

  for (const invalid of [
    { status: 'UNKNOWN' },
    { outputHash: 'bad' },
    { artifactHashes: [HA, HA] },
    { idempotencyEvidenceHash: 'bad' },
  ]) {
    assert.throws(() => result(identity, invalid));
  }
});

test('exact successful pure result is reusable and any execution identity drift is stale', () => {
  const identity = buildNodeExecutionIdentity(identityInput());
  const completed = result(identity);

  assert.deepEqual(
    evaluateNodeResultReuse(completed, { expectedIdentity: identity, sideEffecting: false }),
    {
      status: 'REUSABLE',
      reasons: [],
      authority: 'NONE',
    },
  );

  const changedIdentity = buildNodeExecutionIdentity(identityInput({ configHash: H8 }));
  const stale = evaluateNodeResultReuse(completed, {
    expectedIdentity: changedIdentity,
    sideEffecting: false,
  });
  assert.equal(stale.status, 'STALE');
  assert.deepEqual(stale.reasons, ['execution identity mismatch']);
});

test(
  'semantic negative failed and human-required results never masquerade as reusable success',
  () => {
  const identity = buildNodeExecutionIdentity(identityInput());

  for (const status of ['SEMANTIC_NEGATIVE', 'FAILED', 'HUMAN_REQUIRED']) {
    const completed = result(identity, { status });
    const decision = evaluateNodeResultReuse(completed, {
      expectedIdentity: identity,
      sideEffecting: false,
    });
    assert.equal(decision.status, 'NOT_REUSABLE');
    assert.deepEqual(decision.reasons, ['only successful node results may be reused']);
  }
  },
);

test('side-effecting success additionally requires exact idempotency evidence', () => {
  const identity = buildNodeExecutionIdentity(identityInput());

  const withoutEvidence = evaluateNodeResultReuse(result(identity), {
    expectedIdentity: identity,
    sideEffecting: true,
  });
  assert.equal(withoutEvidence.status, 'NOT_REUSABLE');
  assert.deepEqual(withoutEvidence.reasons, [
    'side-effecting result requires idempotency evidence',
  ]);

  const withEvidence = evaluateNodeResultReuse(
    result(identity, { idempotencyEvidenceHash: H2 }),
    {
      expectedIdentity: identity,
      sideEffecting: true,
    },
  );
  assert.equal(withEvidence.status, 'REUSABLE');
});

test(
  'mandatory join is completion-order independent and accepts only exact reusable predecessors',
  () => {
  const leftIdentity = buildNodeExecutionIdentity(identityInput({ nodeId: 'left-001' }));
  const rightIdentity = buildNodeExecutionIdentity(
    identityInput({ nodeId: 'right-001', inputHash: H4 }),
  );
  const left = result(leftIdentity);
  const right = result(rightIdentity);

  const requirements = [
    { nodeId: 'right-001', expectedIdentity: rightIdentity, sideEffecting: false },
    { nodeId: 'left-001', expectedIdentity: leftIdentity, sideEffecting: false },
  ];

  const first = evaluateMandatoryJoin(
    requirements,
    new Map([
      ['left-001', left],
      ['right-001', right],
    ]),
  );
  const second = evaluateMandatoryJoin(
    [...requirements].reverse(),
    new Map([
      ['right-001', right],
      ['left-001', left],
    ]),
  );

  assert.deepEqual(first, second);
  assert.equal(first.status, 'READY');
  assert.deepEqual(first.acceptedResultHashes, [left.resultHash, right.resultHash].sort());
  assert.deepEqual(first.errors, []);
  assert.equal(first.authority, 'NONE');
  },
);

test(
  'mandatory join fails closed on missing stale semantic-negative and side-effect evidence gaps',
  () => {
  const leftIdentity = buildNodeExecutionIdentity(identityInput({ nodeId: 'left-001' }));
  const rightIdentity = buildNodeExecutionIdentity(
    identityInput({ nodeId: 'right-001', inputHash: H4 }),
  );
  const sideIdentity = buildNodeExecutionIdentity(
    identityInput({ nodeId: 'side-001', inputHash: H5 }),
  );

  const staleRight = result(
    buildNodeExecutionIdentity(identityInput({ nodeId: 'right-001', inputHash: H5 })),
  );
  const semanticLeft = result(leftIdentity, { status: 'SEMANTIC_NEGATIVE' });
  const sideWithoutEvidence = result(sideIdentity);

  const joined = evaluateMandatoryJoin(
    [
      { nodeId: 'left-001', expectedIdentity: leftIdentity, sideEffecting: false },
      {
        nodeId: 'missing-001',
        expectedIdentity: buildNodeExecutionIdentity(identityInput({ nodeId: 'missing-001' })),
        sideEffecting: false,
      },
      { nodeId: 'right-001', expectedIdentity: rightIdentity, sideEffecting: false },
      { nodeId: 'side-001', expectedIdentity: sideIdentity, sideEffecting: true },
    ],
    new Map([
      ['left-001', semanticLeft],
      ['right-001', staleRight],
      ['side-001', sideWithoutEvidence],
    ]),
  );

  assert.equal(joined.status, 'BLOCKED');
  assert.deepEqual(joined.acceptedResultHashes, []);
  assert.deepEqual(joined.errors, [
    'left-001: only successful node results may be reused',
    'missing-001: missing mandatory result',
    'right-001: execution identity mismatch',
    'side-001: side-effecting result requires idempotency evidence',
  ]);
  },
);

test('join and result integrity validation fail closed on malformed or forged state', () => {
  const identity = buildNodeExecutionIdentity(identityInput());
  const completed = result(identity);

  assert.throws(() => evaluateMandatoryJoin([], new Map()), /at least one predecessor/);
  assert.throws(
    () =>
      evaluateMandatoryJoin(
        [
          { nodeId: 'review-001', expectedIdentity: identity, sideEffecting: false },
          { nodeId: 'review-001', expectedIdentity: identity, sideEffecting: false },
        ],
        new Map([['review-001', completed]]),
      ),
    /duplicate mandatory join/,
  );
  assert.throws(
    () =>
      evaluateMandatoryJoin(
        [{ nodeId: 'other-001', expectedIdentity: identity, sideEffecting: false }],
        new Map(),
      ),
    /must match expected identity/,
  );

  assert.throws(() =>
    evaluateNodeResultReuse(
      { ...completed, resultHash: H1 },
      { expectedIdentity: identity, sideEffecting: false },
    ),
  );
  assert.throws(() =>
    evaluateNodeResultReuse(
      { ...completed, identity: { ...identity, executionKey: H1 } },
      { expectedIdentity: identity, sideEffecting: false },
    ),
  );
});

test('node reuse and semantic-negative handling remain authority-neutral', () => {
  assert.equal(nodeResultReuseCanGrantAuthority(), false);
  assert.equal(semanticNegativeCanTriggerModelShopping(), false);
});
