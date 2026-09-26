import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blueprintPublicationCanGrantAuthority,
  blueprintSuggestionCanModifyPublishedBlueprint,
  publishFhKuikaBlueprintV1,
  validateFhKuikaBlueprintDraftV1,
} from '../dist/index.js';

function draft(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'feature-implementation',
    version: '1.0.0',
    purpose: 'Implement a feature through the normal engineering lifecycle.',
    compatibleIntents: ['FEATURE_IMPLEMENTATION'],
    defaultRiskTier: 'NORMAL',
    lifecycleStages: ['PLAN', 'IMPLEMENT', 'TEST', 'REVIEW'],
    requiredEvidence: ['test-results', 'review-result'],
    requiredRoles: ['implementation-agent', 'test-reviewer'],
    independence: {
      required: true,
      minimumDistinctReviewers: 1,
      forbiddenSelfReview: true,
    },
    workflowTemplateRef: 'workflow:feature-implementation@1.0.0',
    parameters: [
      {
        id: 'target-area',
        description: 'Bounded implementation target.',
        required: true,
        valueType: 'STRING',
      },
    ],
    authoritySensitiveNodes: ['final-review'],
    validationRules: ['exact-revision-binding', 'test-required'],
    simulationFixtures: [
      {
        id: 'normal-pass',
        description: 'Normal feature path completes with independent review.',
        expectedTerminalState: 'PASS',
      },
    ],
    status: 'DRAFT',
    authority: 'NONE',
    ...overrides,
  };
}

test('FH-KUIKA blueprint publication is deterministic, immutable and non-authoritative', () => {
  const input = draft();
  validateFhKuikaBlueprintDraftV1(input);

  const first = publishFhKuikaBlueprintV1(input);
  const second = publishFhKuikaBlueprintV1({
    ...input,
    lifecycleStages: [...input.lifecycleStages].reverse(),
    requiredRoles: [...input.requiredRoles].reverse(),
    requiredEvidence: [...input.requiredEvidence].reverse(),
    validationRules: [...input.validationRules].reverse(),
  });

  assert.equal(first.status, 'PUBLISHED');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.blueprintHash.length, 64);
  assert.equal(first.blueprintHash, second.blueprintHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.independence), true);
  assert.equal(Object.isFrozen(first.parameters), true);
  assert.equal(Object.isFrozen(first.parameters[0]), true);
  assert.equal(blueprintPublicationCanGrantAuthority(), false);
  assert.equal(blueprintSuggestionCanModifyPublishedBlueprint(), false);
});

test('blueprint validation rejects authority/policy bypass parameters and invalid independence', () => {
  assert.throws(
    () =>
      validateFhKuikaBlueprintDraftV1(
        draft({
          parameters: [
            {
              id: 'skip-approval',
              description: 'Unsafe override',
              required: false,
              valueType: 'BOOLEAN',
              defaultValue: true,
            },
          ],
        }),
      ),
    /cannot override authority or policy/,
  );

  assert.throws(
    () =>
      validateFhKuikaBlueprintDraftV1(
        draft({
          independence: {
            required: true,
            minimumDistinctReviewers: 0,
            forbiddenSelfReview: true,
          },
        }),
      ),
    /at least one distinct reviewer/,
  );

  assert.throws(
    () =>
      validateFhKuikaBlueprintDraftV1(
        draft({
          independence: {
            required: true,
            minimumDistinctReviewers: 1,
            forbiddenSelfReview: false,
          },
        }),
      ),
    /must forbid self review/,
  );
});

test('blueprint validation requires semantic versioning, unique bounded fields and typed defaults', () => {
  assert.throws(() => validateFhKuikaBlueprintDraftV1(draft({ version: '1.0' })), /semantic/);

  assert.throws(
    () =>
      validateFhKuikaBlueprintDraftV1(draft({ requiredRoles: ['test-reviewer', 'test-reviewer'] })),
    /required role values must be unique/,
  );

  assert.throws(
    () =>
      validateFhKuikaBlueprintDraftV1(
        draft({
          parameters: [
            {
              id: 'retry-count',
              description: 'Retry count',
              required: false,
              valueType: 'NUMBER',
              defaultValue: 'three',
            },
          ],
        }),
      ),
    /defaultValue does not match valueType/,
  );
});
