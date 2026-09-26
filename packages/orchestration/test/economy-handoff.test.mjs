import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCompactAgentHandoff,
  buildLocalPreSolveVerificationPacket,
  economyHandoffCanIncludeFullPrivateTrajectory,
  localPreSolveCanLeakVerdictIntoIndependentRoundZero,
  planReadOnlyRemoteCallCoalescing,
  remoteCallCoalescingCanMergeIndependentOpinions,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

function evidence(id = 'artifact-one', character = 'a') {
  return { artifactId: id, contentHash: hash(character) };
}

function handoff(overrides = {}) {
  return {
    handoffId: 'handoff-one',
    sourceRole: 'implementer',
    targetRole: 'test-reviewer',
    exactRevision: 'abc123',
    runSnapshotHash: hash('1'),
    scopeHash: hash('2'),
    status: 'SUCCEEDED',
    verdict: 'PASS',
    findings: [
      {
        findingId: 'finding-two',
        severity: 'P3',
        summary: 'Second bounded finding',
        evidence: [evidence('artifact-finding-two', 'b')],
      },
      {
        findingId: 'finding-one',
        severity: 'P2',
        summary: 'A bounded finding',
        evidence: [evidence('artifact-finding', '3')],
      },
    ],
    evidence: [evidence('artifact-two', '4'), evidence('artifact-one', '5')],
    unresolvedQuestions: ['Question B', 'Question A'],
    minimalRationale: ['Rationale B', 'Rationale A'],
    provenanceHashes: [hash('7'), hash('6')],
    intendedForIndependentRoundZero: false,
    ...overrides,
  };
}

function preSolve(overrides = {}) {
  return {
    packetId: 'packet-one',
    exactRevision: 'abc123',
    runSnapshotHash: hash('1'),
    scopeHash: hash('2'),
    taskHash: hash('3'),
    acceptanceCriteriaHashes: [hash('5'), hash('4')],
    requiredEvidence: [evidence('artifact-required', '6')],
    relevantSlices: [
      {
        artifactId: 'artifact-source-b',
        contentHash: hash('c'),
        selector: 'src/b.ts:1-5',
      },
      {
        artifactId: 'artifact-source',
        contentHash: hash('7'),
        selector: 'src/a.ts:10-20',
      },
    ],
    candidateArtifact: evidence('artifact-candidate', '8'),
    provenanceHashes: [hash('a'), hash('9')],
    independentRoundZero: false,
    exploratoryTranscriptIncluded: false,
    ...overrides,
  };
}

function question(id, overrides = {}) {
  return {
    questionId: id,
    logicalRole: 'remote-reviewer',
    exactRevision: 'abc123',
    runSnapshotHash: hash('1'),
    scopeHash: hash('2'),
    packetHash: hash('3'),
    readOnly: true,
    independentOpinionRequired: false,
    ...overrides,
  };
}

test('compact handoff contains structured evidence and never contains a private trajectory', () => {
  const result = buildCompactAgentHandoff(handoff());

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.fullTrajectoryIncluded, false);
  assert.equal(result.authority, 'NONE');
  assert.match(result.handoffHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    result.findings.map((item) => item.findingId),
    ['finding-one', 'finding-two'],
  );
  assert.deepEqual(
    result.evidence.map((item) => item.artifactId),
    ['artifact-one', 'artifact-two'],
  );
  assert.deepEqual(result.unresolvedQuestions, ['Question A', 'Question B']);
  assert.deepEqual(result.minimalRationale, ['Rationale A', 'Rationale B']);
  assert.deepEqual(result.provenanceHashes, [hash('6'), hash('7')]);
  assert.equal('trajectory' in result, false);
  assert.equal('reasoning' in result, false);
});

test('independent round-zero handoff is evidence-index-only', () => {
  const result = buildCompactAgentHandoff(
    handoff({
      verdict: undefined,
      findings: [],
      unresolvedQuestions: [],
      minimalRationale: [],
      intendedForIndependentRoundZero: true,
    }),
  );

  assert.equal(result.intendedForIndependentRoundZero, true);
  assert.equal('verdict' in result, false);

  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          intendedForIndependentRoundZero: true,
        }),
      ),
    /must not include a prior verdict/,
  );

  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          verdict: undefined,
          findings: [],
          unresolvedQuestions: ['biased question'],
          minimalRationale: [],
          intendedForIndependentRoundZero: true,
        }),
      ),
    /evidence indexes only/,
  );
});

test('handoff validation fails closed on invalid status findings and duplicate metadata', () => {
  assert.throws(
    () => buildCompactAgentHandoff(handoff({ status: 'UNKNOWN' })),
    /status is invalid/,
  );
  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          findings: [
            {
              findingId: 'finding-one',
              severity: 'P9',
              summary: 'Invalid severity',
              evidence: [evidence()],
            },
          ],
        }),
      ),
    /severity is invalid/,
  );
  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          findings: [
            {
              findingId: 'finding-one',
              severity: 'P2',
              summary: 'Missing evidence',
              evidence: [],
            },
          ],
        }),
      ),
    /requires evidence/,
  );
  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          evidence: [evidence('artifact-one', 'a'), evidence('artifact-one', 'a')],
        }),
      ),
    /duplicate evidence reference/,
  );
  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          unresolvedQuestions: ['same', 'same'],
        }),
      ),
    /duplicate unresolved question/,
  );
  assert.throws(
    () =>
      buildCompactAgentHandoff(
        handoff({
          provenanceHashes: [hash('a'), hash('a')],
        }),
      ),
    /duplicate provenance hash/,
  );
});

test('local pre-solve creates a compact exact-bound verifier packet without exploratory transcript', () => {
  const result = buildLocalPreSolveVerificationPacket(preSolve());

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.remoteExploratoryContextReduced, true);
  assert.equal(result.exploratoryTranscriptIncluded, false);
  assert.equal(result.authority, 'NONE');
  assert.equal(result.candidateArtifact.artifactId, 'artifact-candidate');
  assert.deepEqual(result.acceptanceCriteriaHashes, [hash('4'), hash('5')]);
  assert.deepEqual(result.provenanceHashes, [hash('9'), hash('a')]);
  assert.deepEqual(
    result.relevantSlices.map((slice) => slice.artifactId),
    ['artifact-source-b', 'artifact-source'],
  );
  assert.match(result.packetHash, /^[a-f0-9]{64}$/);
  assert.equal('advisoryVerdict' in result, false);
});

test('independent round-zero pre-solve cannot leak local verdict or trajectory', () => {
  const safe = buildLocalPreSolveVerificationPacket(
    preSolve({
      independentRoundZero: true,
      candidateArtifact: undefined,
    }),
  );
  assert.equal(safe.independentRoundZero, true);
  assert.equal('candidateArtifact' in safe, false);

  assert.throws(
    () =>
      buildLocalPreSolveVerificationPacket(
        preSolve({
          independentRoundZero: true,
          advisoryVerdict: 'APPROVE',
        }),
      ),
    /must not include local advisory verdict/,
  );

  assert.throws(
    () =>
      buildLocalPreSolveVerificationPacket(
        preSolve({
          exploratoryTranscriptIncluded: true,
        }),
      ),
    /must not include exploratory transcript/,
  );
});

test('local pre-solve requires exact acceptance criteria and required evidence', () => {
  assert.throws(
    () => buildLocalPreSolveVerificationPacket(preSolve({ acceptanceCriteriaHashes: [] })),
    /requires acceptance criteria/,
  );
  assert.throws(
    () => buildLocalPreSolveVerificationPacket(preSolve({ requiredEvidence: [] })),
    /requires exact evidence/,
  );
  assert.throws(
    () =>
      buildLocalPreSolveVerificationPacket(
        preSolve({
          relevantSlices: [
            {
              artifactId: 'artifact-source',
              contentHash: 'not-a-hash',
              selector: 'src/a.ts',
            },
          ],
        }),
      ),
    /slice contentHash must be lowercase sha256/,
  );
  assert.throws(
    () =>
      buildLocalPreSolveVerificationPacket(
        preSolve({
          relevantSlices: [
            {
              artifactId: 'artifact-source',
              contentHash: hash('7'),
              selector: 'line one\nline two',
            },
          ],
        }),
      ),
    /bounded single-line text/,
  );
});

test('read-only questions for one role and immutable packet are coalesced deterministically', () => {
  const plan = planReadOnlyRemoteCallCoalescing([question('question-b'), question('question-a')]);

  assert.equal(plan.status, 'COALESCE');
  assert.equal(plan.reason, 'SAME_IMMUTABLE_SCOPE');
  assert.deepEqual(plan.questionIds, ['question-a', 'question-b']);
  assert.match(plan.combinedRequestHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.authority, 'NONE');
});

test('remote call coalescing preserves mutation and reviewer independence boundaries', () => {
  assert.equal(
    planReadOnlyRemoteCallCoalescing([
      question('question-a'),
      question('question-b', { readOnly: false }),
    ]).reason,
    'READ_ONLY_REQUIRED',
  );

  assert.equal(
    planReadOnlyRemoteCallCoalescing([
      question('question-a'),
      question('question-b', { independentOpinionRequired: true }),
    ]).reason,
    'INDEPENDENCE_REQUIRED',
  );

  assert.equal(
    planReadOnlyRemoteCallCoalescing([
      question('question-a'),
      question('question-b', { logicalRole: 'other-reviewer' }),
    ]).reason,
    'ROLE_MISMATCH',
  );

  assert.equal(
    planReadOnlyRemoteCallCoalescing([
      question('question-a'),
      question('question-b', { packetHash: hash('f') }),
    ]).reason,
    'SNAPSHOT_MISMATCH',
  );
});

test('coalescing validates cardinality identity and uniqueness fail closed', () => {
  assert.throws(
    () => planReadOnlyRemoteCallCoalescing([question('question-a')]),
    /at least two questions/,
  );
  assert.throws(
    () => planReadOnlyRemoteCallCoalescing([question('question-a'), question('question-a')]),
    /questionId must be unique/,
  );
  assert.throws(
    () =>
      planReadOnlyRemoteCallCoalescing([
        question('question-a'),
        question('question-b', { scopeHash: 'bad' }),
      ]),
    /scopeHash must be lowercase sha256/,
  );
});

test('economy handoff and coalescing helpers are authority-neutral by contract', () => {
  assert.equal(economyHandoffCanIncludeFullPrivateTrajectory(), false);
  assert.equal(localPreSolveCanLeakVerdictIntoIndependentRoundZero(), false);
  assert.equal(remoteCallCoalescingCanMergeIndependentOpinions(), false);
});
