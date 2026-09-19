import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBoundedExecution } from '../dist/index.js';

test('unbounded loop fails validation', () => {
  const errors = validateBoundedExecution({
    id: 'wf',
    version: '1.0.0',
    hash: 'h',
    nodes: [{ id: 'loop', kind: 'LOOP' }],
  });

  assert.deepEqual(errors, ['LOOP node loop must define maxIterations >= 1']);
});
