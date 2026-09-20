import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateProviderEgress,
  evaluateSandboxPermission,
  parseDataPolicyYaml,
  parseSandboxPolicyYaml,
} from '@freehighlander/governance';
import { validateEngineeringPlan } from '@freehighlander/planning';
import { validateChangeCandidate, validateTaskCandidateBinding } from '@freehighlander/development';
import { traverseLineage, validateLineageGraph } from '@freehighlander/lineage';
import { createHardeningEvent, parseEvent } from '@freehighlander/telemetry';

const repository = 'skonyd/freehighlander-engineering-platform';
const baseRevision = '1'.repeat(40);
const headRevision = '2'.repeat(40);
const digest = (character) => character.repeat(64);

const [dataPolicySource, sandboxPolicySource] = await Promise.all([
  readFile(new URL('../../../.freehighlander/data-policy.yaml', import.meta.url), 'utf8'),
  readFile(new URL('../../../.freehighlander/sandbox-policy.yaml', import.meta.url), 'utf8'),
]);
const dataPolicy = parseDataPolicyYaml(dataPolicySource);
const sandboxPolicy = parseSandboxPolicyYaml(sandboxPolicySource);

function validPlan() {
  return {
    schemaVersion: 1,
    id: 'plan-1',
    revision: 1,
    title: 'Adversarial plan',
    repository,
    baseRevision,
    status: 'READY',
    acceptanceCriteria: [{ id: 'ac-1', text: 'Fail closed' }],
    workItems: [
      {
        id: 'work-1',
        title: 'Validate boundaries',
        dependsOn: [],
        acceptanceCriteria: ['ac-1'],
      },
    ],
    blockers: [],
  };
}

function validDevelopment() {
  const task = {
    schemaVersion: 1,
    id: 'task-1',
    revision: 1,
    title: 'Implement bounded change',
    repository,
    baseRevision,
    status: 'CANDIDATE',
    intent: 'Change one bounded path',
    acceptanceCriteria: ['ac-1'],
    scopePaths: [{ path: 'packages/lineage/src/index.ts' }],
    blockers: [],
  };

  const candidate = {
    schemaVersion: 1,
    id: 'candidate-1',
    taskId: task.id,
    repository,
    baseRevision,
    headRevision,
    intent: task.intent,
    affectedPaths: [{ path: 'packages/lineage/src/index.ts', change: 'MODIFY' }],
    resultEvidence: [
      {
        id: 'evidence-1',
        kind: 'DIFF',
        repository,
        revision: headRevision,
        provenance: 'TRUSTED',
        digest: digest('a'),
      },
    ],
    shadowPlan: [
      {
        id: 'shadow-1',
        kind: 'ANALYZE',
        description: 'Read only',
        affectedPaths: ['packages/lineage/src/index.ts'],
        sideEffects: 'FORBIDDEN',
        authority: 'NONE',
      },
    ],
  };

  return { task, candidate };
}

function validLineage() {
  const trustedEvidence = [{ id: 'ev-1', digest: digest('e'), provenance: 'TRUSTED' }];
  return {
    schemaVersion: 1,
    entities: [
      {
        schemaVersion: 1,
        id: 'req-1',
        version: 1,
        kind: 'REQUIREMENT',
        label: 'Requirement',
        digest: digest('1'),
      },
      {
        schemaVersion: 1,
        id: 'ac-1',
        version: 1,
        kind: 'ACCEPTANCE_CRITERION',
        label: 'Acceptance criterion',
        digest: digest('2'),
      },
      {
        schemaVersion: 1,
        id: 'code-1',
        version: 1,
        kind: 'CODE_REVISION',
        label: 'Code',
        digest: digest('3'),
        revision: { repository, sha: headRevision },
      },
    ],
    relations: [
      {
        schemaVersion: 1,
        id: 'rel-1',
        kind: 'REFINES',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'req-1', version: 1 },
        to: { id: 'ac-1', version: 1 },
        evidence: trustedEvidence,
      },
      {
        schemaVersion: 1,
        id: 'rel-2',
        kind: 'IMPLEMENTED_BY',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'ac-1', version: 1 },
        to: { id: 'code-1', version: 1 },
        evidence: trustedEvidence,
      },
    ],
    authority: 'NONE',
    semanticSearchAuthority: 'FORBIDDEN',
    storageModel: 'RELATIONAL_FIRST',
  };
}

test('adversarial planning mutations fail closed as a deterministic table', () => {
  const plan = validPlan();
  const cases = [
    {
      name: 'unknown dependency',
      mutate: (value) => ({
        ...value,
        workItems: [{ ...value.workItems[0], dependsOn: ['missing'] }],
      }),
      expected: /unknown dependency/,
    },
    {
      name: 'self dependency',
      mutate: (value) => ({
        ...value,
        workItems: [{ ...value.workItems[0], dependsOn: ['work-1'] }],
      }),
      expected: /cannot depend on itself|must be acyclic/,
    },
    {
      name: 'cycle',
      mutate: (value) => ({
        ...value,
        workItems: [
          { ...value.workItems[0], dependsOn: ['work-2'] },
          {
            id: 'work-2',
            title: 'Cycle peer',
            dependsOn: ['work-1'],
            acceptanceCriteria: ['ac-1'],
          },
        ],
      }),
      expected: /must be acyclic/,
    },
    {
      name: 'ready with blocker',
      mutate: (value) => ({
        ...value,
        blockers: [{ id: 'block-1', reason: 'must remain blocked' }],
      }),
      expected: /READY plan cannot retain blockers/,
    },
  ];

  for (const adversarialCase of cases) {
    const result = validateEngineeringPlan(adversarialCase.mutate(structuredClone(plan)));
    assert.equal(result.valid, false, adversarialCase.name);
    assert.match(result.errors.join('\n'), adversarialCase.expected, adversarialCase.name);
  }
});

test('combined development scope, revision, evidence and side-effect corruption fails closed', () => {
  const { task, candidate } = validDevelopment();
  const invalid = {
    ...candidate,
    baseRevision: '9'.repeat(40),
    affectedPaths: [{ path: '../outside-repository', change: 'MODIFY' }],
    resultEvidence: [
      {
        ...candidate.resultEvidence[0],
        repository: 'attacker/other-repository',
        revision: baseRevision,
        digest: 'not-a-sha256',
      },
    ],
    shadowPlan: [
      {
        ...candidate.shadowPlan[0],
        affectedPaths: ['../outside-repository'],
        sideEffects: 'ALLOWED',
        authority: 'WRITER',
      },
    ],
  };

  const candidateResult = validateChangeCandidate(invalid);
  const bindingResult = validateTaskCandidateBinding(task, invalid);
  assert.equal(candidateResult.valid, false);
  assert.equal(bindingResult.valid, false);

  const combined = [...candidateResult.errors, ...bindingResult.errors].join('\n');
  assert.match(combined, /repository path|outside|relative|path/);
  assert.match(combined, /repository must match/);
  assert.match(combined, /revision must match/);
  assert.match(combined, /lowercase sha256/);
  assert.match(combined, /sideEffects must be FORBIDDEN/);
  assert.match(combined, /authority must be NONE/);
  assert.match(combined, /baseRevision must match/);
});

test('policy and sandbox layers deny privilege escalation independently', () => {
  const secretRemote = evaluateProviderEgress(dataPolicy, {
    classification: 'SECRET',
    remote: true,
    policyApproved: true,
    providerBindingApproved: true,
  });
  assert.equal(secretRemote.allowed, false);
  assert.equal(secretRemote.authority, 'NONE');

  const sandboxCases = [
    {
      capability: 'UNKNOWN',
      repositoryRoot: '/repo',
      roleAllows: true,
      workflowAllows: true,
    },
    {
      capability: 'FILESYSTEM_WRITE',
      repositoryRoot: '/repo',
      roleAllows: true,
      workflowAllows: true,
      targetPath: '../outside',
    },
    {
      capability: 'COMMAND_EXECUTE',
      repositoryRoot: '/repo',
      roleAllows: true,
      workflowAllows: true,
      cwd: '/repo',
      timeoutMs: 0,
      envAllowlist: [],
    },
    {
      capability: 'DESTRUCTIVE_ACTION',
      repositoryRoot: '/repo',
      roleAllows: true,
      workflowAllows: true,
      humanApproved: false,
    },
    {
      capability: 'NETWORK_OUTBOUND',
      repositoryRoot: '/repo',
      roleAllows: false,
      workflowAllows: true,
    },
    {
      capability: 'SECRET_ACCESS',
      repositoryRoot: '/repo',
      roleAllows: true,
      workflowAllows: true,
      promptRequestedExpansion: true,
    },
  ];

  for (const request of sandboxCases) {
    const decision = evaluateSandboxPermission(sandboxPolicy, request);
    assert.equal(decision.allowed, false);
    assert.equal(decision.authority, 'NONE');
  }
});

test('lineage rejects multiple simultaneous provenance and identity corruptions', () => {
  const graph = validLineage();
  const invalid = {
    ...graph,
    entities: [...graph.entities, { ...graph.entities[2] }],
    relations: [
      {
        ...graph.relations[0],
        id: 'rel-duplicate',
        to: { id: 'missing', version: 1 },
        evidence: [
          { id: 'dup', digest: digest('a'), provenance: 'UNTRUSTED' },
          { id: 'dup', digest: 'invalid', provenance: 'UNTRUSTED' },
        ],
      },
      {
        ...graph.relations[1],
        id: 'rel-duplicate',
      },
    ],
  };

  const result = validateLineageGraph(invalid);
  assert.equal(result.valid, false);
  const errors = result.errors.join('\n');
  assert.match(errors, /duplicate entity version/);
  assert.match(errors, /missing to endpoint/);
  assert.match(errors, /duplicate relation id/);
  assert.match(errors, /duplicate relation evidence id/);
  assert.match(errors, /lowercase sha256/);
  assert.match(errors, /requires trusted provenance/);

  assert.throws(
    () => traverseLineage(graph, { id: 'req-1', version: 1 }, 11),
    /maxDepth must be an integer between 0 and 10/,
  );
  assert.throws(
    () => traverseLineage(graph, { id: 'unknown', version: 1 }, 1),
    /unknown lineage start entity/,
  );
});

test('telemetry parsers and hardening payloads reject malformed or secret-bearing input', () => {
  const malformed = [
    '{}',
    JSON.stringify({
      schemaVersion: 1,
      type: 'run.started',
      timestamp: 'not-a-time',
      runId: '',
      payload: {},
    }),
    JSON.stringify({
      schemaVersion: 999,
      type: 'run.started',
      timestamp: '2026-09-20T12:00:00.000Z',
      runId: 'run-1',
      payload: {},
    }),
  ];

  for (const line of malformed) {
    assert.throws(() => parseEvent(line), /invalid telemetry event|Unexpected/);
  }

  assert.throws(
    () =>
      createHardeningEvent({
        type: 'sandbox.decision',
        timestamp: '2026-09-20T12:00:00.000Z',
        runId: 'run-1',
        payload: {
          category: 'sandbox',
          action: 'evaluate',
          outcome: 'DENY',
          reasonCode: 'BOUNDARY',
          password: 'do-not-persist',
        },
      }),
    /field is not allowed: password/,
  );
});
