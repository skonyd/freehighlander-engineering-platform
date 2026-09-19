import assert from 'node:assert/strict';
import test from 'node:test';

import { rolePackageSchema, workflowSpecSchema } from '../dist/index.js';

test('role package accepts a bounded advisory role', () => {
  const role = rolePackageSchema.parse({
    id: 'repo-analyst',
    version: '1.0.0',
    purpose: 'Analyze repository evidence',
    authority: ['ADVISORY'],
    allowedActions: ['read'],
    forbiddenActions: ['merge'],
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    promptContract: 'prompts/repo-analyst@1',
    inputContract: 'contracts/repo-analysis-input@1',
    outputContract: 'contracts/repo-analysis-output@1',
    evidencePolicy: 'evidence/default@1',
    sandboxPolicy: 'sandbox/read-only@1',
    independenceGroupRequired: false,
  });

  assert.equal(role.id, 'repo-analyst');
});

test('workflow rejects an unbounded loop', () => {
  const result = workflowSpecSchema.safeParse({
    id: 'unsafe-loop',
    version: '1.0.0',
    nodes: [{ id: 'retry', kind: 'LOOP' }],
    edges: [],
  });

  assert.equal(result.success, false);
});
