import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFhKuikaPlanCandidateV1,
  fhKuikaPlanCandidateCanAuthorizeExecution,
  fhKuikaPlanCandidateCanGrantAuthority,
  validateFhKuikaPlanCandidateV1,
} from '../dist/index.js';

function readyCandidate() {
  return createFhKuikaPlanCandidateV1({
    candidateId: 'plan-candidate-1',
    title: 'Add deterministic Workbench planning',
    repository: 'skonyd/freehighlander-engineering-platform',
    exactRevision: 'a'.repeat(40),
    status: 'READY',
    acceptanceCriteria: [
      { id: 'AC-1', text: 'PLAN output is exact-revision bound.' },
      { id: 'AC-2', text: 'PLAN output cannot authorize execution.' },
    ],
    workItems: [
      {
        id: 'W-1',
        title: 'Add plan candidate contract',
        dependsOn: [],
        acceptanceCriteria: ['AC-1'],
      },
      {
        id: 'W-2',
        title: 'Render structured candidate',
        dependsOn: ['W-1'],
        acceptanceCriteria: ['AC-2'],
      },
    ],
    blockers: [],
    blueprintSuggestions: [
      {
        blueprintId: 'feature-implementation',
        blueprintVersion: '1.0.0',
        reason: 'The requested work is a bounded feature implementation.',
        confidence: 'HIGH',
      },
    ],
  });
}

test('FH-KUIKA PLAN candidate is structured, exact-bound and non-authoritative', () => {
  const candidate = readyCandidate();

  assert.equal(candidate.schemaVersion, 1);
  assert.equal(candidate.status, 'READY');
  assert.equal(candidate.exactRevision.length, 40);
  assert.equal(candidate.authority, 'NONE');
  assert.equal(candidate.executionAuthorized, false);
  assert.equal(fhKuikaPlanCandidateCanGrantAuthority(), false);
  assert.equal(fhKuikaPlanCandidateCanAuthorizeExecution(), false);
  assert.deepEqual(validateFhKuikaPlanCandidateV1(candidate), {
    valid: true,
    errors: [],
  });
});

test('FH-KUIKA PLAN candidate fails closed on invalid graph and references', () => {
  const candidate = readyCandidate();
  const invalid = {
    ...candidate,
    workItems: [
      {
        id: 'W-1',
        title: 'Invalid work',
        dependsOn: ['W-1', 'UNKNOWN'],
        acceptanceCriteria: ['UNKNOWN'],
      },
    ],
  };

  const result = validateFhKuikaPlanCandidateV1(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('cannot depend on itself')));
  assert.ok(result.errors.some((error) => error.includes('unknown dependency')));
  assert.ok(result.errors.some((error) => error.includes('unknown acceptance criterion')));
  assert.ok(result.errors.some((error) => error.includes('acyclic')));
});

test('READY and BLOCKED PLAN candidate invariants are deterministic', () => {
  const ready = readyCandidate();

  const readyWithBlocker = validateFhKuikaPlanCandidateV1({
    ...ready,
    blockers: [{ id: 'B-1', reason: 'External dependency unavailable.' }],
  });
  assert.equal(readyWithBlocker.valid, false);
  assert.ok(readyWithBlocker.errors.includes('READY candidate cannot retain blockers'));

  const blockedWithoutBlocker = validateFhKuikaPlanCandidateV1({
    ...ready,
    status: 'BLOCKED',
    blockers: [],
  });
  assert.equal(blockedWithoutBlocker.valid, false);
  assert.ok(
    blockedWithoutBlocker.errors.includes('BLOCKED candidate requires at least one blocker'),
  );
});

test('blueprint suggestions are versioned and duplicate-safe', () => {
  const candidate = readyCandidate();
  const result = validateFhKuikaPlanCandidateV1({
    ...candidate,
    blueprintSuggestions: [
      ...candidate.blueprintSuggestions,
      ...candidate.blueprintSuggestions,
      {
        blueprintId: 'bad-version',
        blueprintVersion: 'latest',
        reason: 'Invalid unpinned version.',
        confidence: 'LOW',
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate blueprint suggestion')));
  assert.ok(result.errors.some((error) => error.includes('semantic version')));
});
