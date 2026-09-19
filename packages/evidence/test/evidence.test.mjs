import assert from 'node:assert/strict';
import test from 'node:test';

import { artifactIdentityKey, isArtifactCurrent } from '../dist/index.js';

const artifact = {
  artifactId: 'a-1',
  exactRevision: 'abc',
  producerRole: 'repo-analyst',
  bindingId: 'qwen-local',
  provider: 'openai-compatible',
  model: 'qwen',
  inputHash: 'in',
  outputHash: 'out',
  contractHash: 'contract-v1',
};

test('artifact validity is exact revision and contract bound', () => {
  assert.equal(
    isArtifactCurrent(artifact, { exactRevision: 'abc', contractHash: 'contract-v1' }),
    true,
  );
  assert.equal(
    isArtifactCurrent(artifact, { exactRevision: 'def', contractHash: 'contract-v1' }),
    false,
  );
});

test('artifact identity changes when revision changes', () => {
  assert.notEqual(
    artifactIdentityKey(artifact),
    artifactIdentityKey({ ...artifact, exactRevision: 'def' }),
  );
});
