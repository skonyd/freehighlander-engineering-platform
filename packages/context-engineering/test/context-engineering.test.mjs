import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoritativeItemIds,
  buildContextPacketManifest,
  buildSemanticReuseKey,
} from '../dist/index.js';

const revision = {
  repository: 'skonyd/freehighlander-engineering-platform',
  baseSha: 'base-1',
  headSha: 'head-1',
};

test('same semantic context produces the same deterministic packet hash', async () => {
  const input = {
    profile: 'implementation',
    revision,
    items: [
      {
        id: 'repo-contract',
        kind: 'stable-repository',
        content: 'stable rules',
      },
      {
        id: 'full-diff',
        kind: 'evidence',
        content: 'diff body',
        requiredForAuthority: true,
      },
      {
        id: 'task',
        kind: 'task',
        content: 'implement FH-07A',
      },
    ],
  };

  const left = await buildContextPacketManifest(input);
  const right = await buildContextPacketManifest(input);

  assert.equal(left.packetHash, right.packetHash);
  assert.equal(left.items[1]?.requiredForAuthority, true);
  assert.deepEqual(authoritativeItemIds(left), ['full-diff']);
});

test('packet identity changes when content, order or exact revision changes', async () => {
  const base = {
    profile: 'implementation',
    revision,
    items: [
      { id: 'stable', kind: 'stable-system', content: 'system' },
      { id: 'task', kind: 'task', content: 'task' },
    ],
  };

  const original = await buildContextPacketManifest(base);
  const changedContent = await buildContextPacketManifest({
    ...base,
    items: [
      { id: 'stable', kind: 'stable-system', content: 'system-v2' },
      { id: 'task', kind: 'task', content: 'task' },
    ],
  });
  const changedOrder = await buildContextPacketManifest({
    ...base,
    items: [...base.items].reverse(),
  });
  const changedRevision = await buildContextPacketManifest({
    ...base,
    revision: { ...revision, headSha: 'head-2' },
  });

  assert.notEqual(original.packetHash, changedContent.packetHash);
  assert.notEqual(original.packetHash, changedOrder.packetHash);
  assert.notEqual(original.packetHash, changedRevision.packetHash);
});

test('manifest stores hashes and lengths instead of raw context content', async () => {
  const manifest = await buildContextPacketManifest({
    profile: 'review',
    revision,
    items: [
      {
        id: 'evidence',
        kind: 'evidence',
        content: 'secret-ish evidence body',
        requiredForAuthority: true,
      },
    ],
  });

  assert.equal('content' in manifest.items[0], false);
  assert.equal(manifest.items[0]?.byteLength, 24);
  assert.match(manifest.items[0]?.contentHash ?? '', /^[a-f0-9]{64}$/);
});

test('duplicate context item identifiers fail closed', async () => {
  await assert.rejects(
    () =>
      buildContextPacketManifest({
        profile: 'implementation',
        revision,
        items: [
          { id: 'same', kind: 'task', content: 'a' },
          { id: 'same', kind: 'evidence', content: 'b' },
        ],
      }),
    /duplicate context item id/,
  );
});

test('semantic reuse key is stable for identical inputs', async () => {
  const input = {
    logicalRole: 'test-reviewer',
    revision,
    workflowHash: 'workflow-hash',
    roleContractHash: 'role-contract-hash',
    promptVersion: 'test-reviewer:v3',
    policyHash: 'policy-hash',
    bindingId: 'opus-medium',
    model: 'opus',
    effort: 'medium',
    relevantInputHash: 'packet-hash',
  };

  const left = await buildSemanticReuseKey(input);
  const right = await buildSemanticReuseKey(input);

  assert.equal(left.key, right.key);
  assert.match(left.key, /^[a-f0-9]{64}$/);
});

test('reuse identity invalidates on every authority-relevant semantic dimension', async () => {
  const base = {
    logicalRole: 'test-reviewer',
    revision,
    workflowHash: 'workflow-hash',
    roleContractHash: 'role-contract-hash',
    promptVersion: 'test-reviewer:v3',
    policyHash: 'policy-hash',
    bindingId: 'opus-medium',
    model: 'opus',
    effort: 'medium',
    relevantInputHash: 'packet-hash',
  };

  const original = (await buildSemanticReuseKey(base)).key;
  const mutations = [
    { ...base, revision: { ...revision, headSha: 'head-2' } },
    { ...base, workflowHash: 'workflow-hash-2' },
    { ...base, roleContractHash: 'role-contract-hash-2' },
    { ...base, promptVersion: 'test-reviewer:v4' },
    { ...base, policyHash: 'policy-hash-2' },
    { ...base, bindingId: 'opus-high' },
    { ...base, model: 'opus-next' },
    { ...base, effort: 'high' },
    { ...base, relevantInputHash: 'packet-hash-2' },
  ];

  for (const mutation of mutations) {
    assert.notEqual((await buildSemanticReuseKey(mutation)).key, original);
  }
});
