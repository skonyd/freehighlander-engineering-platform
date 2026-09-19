import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextPacket,
  buildContractFingerprint,
  buildSemanticReuseKey,
  tokenOptimizationCanChangeAuthority,
  trimStaleContextItems,
  validateBoundedExecution,
} from '../dist/index.js';

test('unbounded loop fails validation', () => {
  const errors = validateBoundedExecution({
    id: 'wf',
    version: '1.0.0',
    hash: 'h',
    nodes: [{ id: 'loop', kind: 'LOOP' }],
  });

  assert.deepEqual(errors, ['LOOP node loop must define maxIterations >= 1']);
});

test('context packet identity is deterministic and content-bound', () => {
  const items = [
    {
      id: 'contract',
      source: 'AGENTS.md',
      kind: 'repository-contract',
      content: 'producer != final approver',
      requiredByGate: true,
    },
    {
      id: 'task',
      source: 'issue#11',
      kind: 'task',
      content: 'implement context packet',
    },
  ];

  const first = buildContextPacket('implementation', items);
  const second = buildContextPacket('implementation', items);
  const changed = buildContextPacket('implementation', [
    items[0],
    { ...items[1], content: 'changed task' },
  ]);

  assert.equal(first.packetHash, second.packetHash);
  assert.equal(first.packetId, second.packetId);
  assert.notEqual(first.packetHash, changed.packetHash);
  assert.equal(first.manifest[0].requiredByGate, true);
  assert.equal(first.manifest[0].contentHash.length, 64);
});

test('duplicate context IDs fail closed', () => {
  assert.throws(
    () =>
      buildContextPacket('implementation', [
        { id: 'same', source: 'a', kind: 'evidence', content: 'one' },
        { id: 'same', source: 'b', kind: 'evidence', content: 'two' },
      ]),
    /duplicate context item id/,
  );
});

test('stale trimming never removes gate-required evidence', () => {
  const trimmed = trimStaleContextItems([
    {
      id: 'required-old',
      source: 'diff',
      kind: 'evidence',
      content: 'full diff',
      requiredByGate: true,
      stale: true,
    },
    {
      id: 'optional-old',
      source: 'diagnostic',
      kind: 'tool-result',
      content: 'old output',
      stale: true,
    },
    {
      id: 'current',
      source: 'task',
      kind: 'task',
      content: 'current task',
    },
  ]);

  assert.deepEqual(
    trimmed.map((item) => item.id),
    ['required-old', 'current'],
  );
  assert.equal(tokenOptimizationCanChangeAuthority(), false);
});

test('contract fingerprint and semantic reuse key bind all correctness inputs', () => {
  const roleContractHash = buildContractFingerprint({
    promptVersion: 'review:v3',
    roleContract: 'role-v3',
    inputContract: 'input-v2',
    outputContract: 'output-v2',
    evidencePolicy: 'full-diff',
    policyVersion: 'authority-v2',
  });

  const base = {
    logicalRole: 'test-reviewer',
    exactRevision: 'abc',
    workflowHash: 'workflow',
    roleContractHash,
    promptVersion: 'review:v3',
    policyHash: 'policy',
    bindingId: 'opus-medium',
    model: 'opus',
    effort: 'medium',
    relevantInputHash: 'input',
  };

  const first = buildSemanticReuseKey(base);
  assert.equal(first, buildSemanticReuseKey(base));
  assert.notEqual(first, buildSemanticReuseKey({ ...base, exactRevision: 'def' }));
  assert.notEqual(first, buildSemanticReuseKey({ ...base, relevantInputHash: 'other' }));
  assert.notEqual(first, buildSemanticReuseKey({ ...base, effort: 'high' }));
});
