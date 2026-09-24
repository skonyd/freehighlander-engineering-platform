import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contextEconomyCanDropRequiredEvidence,
  contextEconomyCanGrantAuthority,
  contextOptimizerCanReclassifyProtectedDownward,
  evaluateContextReduction,
} from '../dist/index.js';

test('required gate evidence must be PROTECTED and is never reducible', () => {
  assert.throws(
    () =>
      evaluateContextReduction({
        id: 'security-evidence',
        compressionClass: 'EXTRACTIVE',
        lifecycleState: 'ACTIVE',
        requiredByGate: true,
      }),
    /requiredByGate context must be classified PROTECTED/,
  );

  const decision = evaluateContextReduction({
    id: 'security-evidence',
    compressionClass: 'PROTECTED',
    lifecycleState: 'ACTIVE',
    requiredByGate: true,
  });

  assert.equal(decision.mayDrop, false);
  assert.equal(decision.mayLosslesslyTransform, false);
  assert.equal(decision.mayExtract, false);
  assert.equal(decision.maySemanticallyCompress, false);
  assert.equal(decision.reason, 'REQUIRED_BY_GATE');
  assert.equal(decision.authority, 'NONE');
});

test('protected lifecycle cannot be weakened by a lower compression class', () => {
  const decision = evaluateContextReduction({
    id: 'merge-prerequisite',
    compressionClass: 'SEMANTIC_ALLOWED',
    lifecycleState: 'PROTECTED',
  });

  assert.equal(decision.mayDrop, false);
  assert.equal(decision.maySemanticallyCompress, false);
  assert.equal(decision.reason, 'PROTECTED_LIFECYCLE');
});

test('lossless, extractive and semantic classes expose only their permitted reductions', () => {
  const lossless = evaluateContextReduction({
    id: 'manifest',
    compressionClass: 'LOSSLESS',
    lifecycleState: 'ACTIVE',
  });
  assert.equal(lossless.mayLosslesslyTransform, true);
  assert.equal(lossless.mayDrop, false);
  assert.equal(lossless.mayExtract, false);

  const extractive = evaluateContextReduction({
    id: 'old-tool-output',
    compressionClass: 'EXTRACTIVE',
    lifecycleState: 'SUPERSEDED',
  });
  assert.equal(extractive.mayDrop, true);
  assert.equal(extractive.mayExtract, true);
  assert.equal(extractive.maySemanticallyCompress, false);

  const semantic = evaluateContextReduction({
    id: 'advisory-notes',
    compressionClass: 'SEMANTIC_ALLOWED',
    lifecycleState: 'ACTIVE',
  });
  assert.equal(semantic.mayDrop, false);
  assert.equal(semantic.maySemanticallyCompress, true);
});

test('token economy context classification never grants authority or required-evidence removal', () => {
  assert.equal(contextEconomyCanDropRequiredEvidence(), false);
  assert.equal(contextOptimizerCanReclassifyProtectedDownward(), false);
  assert.equal(contextEconomyCanGrantAuthority(), false);
});
