import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintMatcherCanGrantAuthority,
  blueprintMatcherCanLowerRisk,
  matchFhKuikaBlueprintsV1,
  publishFhKuikaBlueprintV1,
} from '../dist/index.js';

function blueprint({
  id,
  version = '1.0.0',
  intent = 'FEATURE_IMPLEMENTATION',
  risk = 'NORMAL',
  roles = ['implementation-agent', 'test-reviewer'],
  evidence = ['test-results'],
  independence = false,
  stages = ['PLAN', 'IMPLEMENT', 'TEST', 'REVIEW'],
}) {
  return publishFhKuikaBlueprintV1({
    schemaVersion: 1,
    id,
    version,
    purpose: 'Test blueprint ' + id,
    compatibleIntents: [intent],
    defaultRiskTier: risk,
    lifecycleStages: stages,
    requiredEvidence: evidence,
    requiredRoles: roles,
    independence: {
      required: independence,
      minimumDistinctReviewers: independence ? 1 : 0,
      forbiddenSelfReview: independence,
    },
    workflowTemplateRef: 'workflow:' + id + '@' + version,
    parameters: [],
    authoritySensitiveNodes: ['final-review'],
    validationRules: ['exact-revision-binding'],
    simulationFixtures: [
      {
        id: 'pass',
        description: 'Pass fixture',
        expectedTerminalState: 'PASS',
      },
    ],
    status: 'DRAFT',
    authority: 'NONE',
  });
}

test('blueprint matcher deterministically ranks eligible candidates with evidence', () => {
  const exact = blueprint({ id: 'feature-exact', risk: 'HIGH', independence: true });
  const normal = blueprint({ id: 'feature-normal', risk: 'NORMAL' });
  const bug = blueprint({ id: 'bug-fix', intent: 'BUG_FIX', risk: 'HIGH' });

  const matches = matchFhKuikaBlueprintsV1(
    {
      intent: 'FEATURE_IMPLEMENTATION',
      requestedRiskTier: 'HIGH',
      desiredLifecycleStages: ['TEST', 'REVIEW'],
      knownRoleIds: ['implementation-agent', 'test-reviewer'],
      knownEvidenceKinds: ['test-results'],
    },
    [normal, bug, exact],
  );

  assert.equal(matches[0].blueprintId, 'feature-exact');
  assert.equal(matches[0].eligible, true);
  assert.equal(matches[0].effectiveRiskTier, 'HIGH');
  assert.ok(matches[0].evidence.some((item) => item.rule === 'RISK_EXACT'));
  assert.ok(matches[0].evidence.some((item) => item.rule === 'INDEPENDENCE_ALIGNED'));

  const bugCandidate = matches.find((item) => item.blueprintId === 'bug-fix');
  assert.equal(bugCandidate.eligible, false);
  assert.equal(
    bugCandidate.evidence.find((item) => item.rule === 'INTENT_COMPATIBLE').passed,
    false,
  );
});

test('matcher never lowers requested or blueprint default risk', () => {
  const normal = blueprint({ id: 'normal-blueprint', risk: 'NORMAL' });
  const critical = blueprint({ id: 'critical-blueprint', risk: 'CRITICAL' });

  const requestedCritical = matchFhKuikaBlueprintsV1(
    { intent: 'FEATURE_IMPLEMENTATION', requestedRiskTier: 'CRITICAL' },
    [normal],
  )[0];
  assert.equal(requestedCritical.effectiveRiskTier, 'CRITICAL');

  const blueprintCritical = matchFhKuikaBlueprintsV1(
    { intent: 'FEATURE_IMPLEMENTATION', requestedRiskTier: 'NORMAL' },
    [critical],
  )[0];
  assert.equal(blueprintCritical.effectiveRiskTier, 'CRITICAL');

  assert.equal(blueprintMatcherCanLowerRisk(), false);
  assert.equal(blueprintMatcherCanGrantAuthority(), false);
});

test('known missing role or evidence makes a candidate ineligible', () => {
  const candidate = blueprint({ id: 'requires-capabilities' });

  const [match] = matchFhKuikaBlueprintsV1(
    {
      intent: 'FEATURE_IMPLEMENTATION',
      requestedRiskTier: 'NORMAL',
      knownRoleIds: ['implementation-agent'],
      knownEvidenceKinds: [],
    },
    [candidate],
  );

  assert.equal(match.eligible, false);
  assert.ok(match.evidence.some((item) => item.rule === 'ROLE_MISSING'));
  assert.ok(match.evidence.some((item) => item.rule === 'EVIDENCE_MISSING'));
});

test('matcher tie-break is stable by blueprint id then descending semver', () => {
  const a1 = blueprint({ id: 'alpha', version: '1.0.0' });
  const a2 = blueprint({ id: 'alpha', version: '2.0.0' });
  const beta = blueprint({ id: 'beta', version: '9.0.0' });

  const matches = matchFhKuikaBlueprintsV1(
    { intent: 'FEATURE_IMPLEMENTATION', requestedRiskTier: 'NORMAL' },
    [beta, a1, a2],
  );

  assert.deepEqual(
    matches.map((item) => item.blueprintId + '@' + item.blueprintVersion),
    ['alpha@2.0.0', 'alpha@1.0.0', 'beta@9.0.0'],
  );
});
