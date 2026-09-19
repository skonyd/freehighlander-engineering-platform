import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTokenPolicy,
  budgetNameForContextProfile,
  resolveContextProfile,
  tokenBudgetFor,
} from '../lib/context-policy.mjs';

const tokenPolicy = {
  schema_version: 1,
  budgets: {
    implementation: {
      target_input_tokens: 40000,
      hard_warn_tokens: 80000,
    },
  },
  prompt_layout: {
    order: ['stable_system_and_role_contract', 'volatile_user_request'],
  },
  tool_context: {
    preserve_authoritative_evidence: true,
  },
};

test('token policy returns exact configured budget without estimating', () => {
  assertTokenPolicy(tokenPolicy);
  assert.deepEqual(tokenBudgetFor(tokenPolicy, 'implementation'), {
    targetInputTokens: 40000,
    hardWarnTokens: 80000,
  });
});

test('token policy rejects authority-evidence weakening', () => {
  assert.throws(
    () =>
      assertTokenPolicy({
        ...tokenPolicy,
        tool_context: { preserve_authoritative_evidence: false },
      }),
    /preserve authoritative evidence/,
  );
});

test('context profile inheritance is deterministic and explains inclusion', () => {
  const config = {
    schema_version: 1,
    default_profile: 'resume-minimal',
    profiles: {
      'resume-minimal': {
        purpose: 'resume',
        read: ['AGENTS.md', 'PROJECT_STATE.md'],
      },
      implementation: {
        extends: 'resume-minimal',
        purpose: 'implement',
        read: ['PROJECT_STATE.md', 'docs/testing/QUALITY-STRATEGY.md'],
        dynamic: ['active_work_item'],
      },
    },
  };

  const resolved = resolveContextProfile(config, 'implementation');
  assert.deepEqual(resolved.ancestry, ['resume-minimal', 'implementation']);
  assert.deepEqual(resolved.read, [
    'AGENTS.md',
    'PROJECT_STATE.md',
    'docs/testing/QUALITY-STRATEGY.md',
  ]);
  assert.deepEqual(resolved.readReasons, [
    { path: 'AGENTS.md', introducedBy: 'resume-minimal' },
    { path: 'PROJECT_STATE.md', introducedBy: 'resume-minimal' },
    { path: 'docs/testing/QUALITY-STRATEGY.md', introducedBy: 'implementation' },
  ]);
  assert.deepEqual(resolved.dynamic, ['active_work_item']);
});

test('context profile inheritance cycles fail closed', () => {
  const config = {
    schema_version: 1,
    default_profile: 'a',
    profiles: {
      a: { extends: 'b' },
      b: { extends: 'a' },
    },
  };

  assert.throws(() => resolveContextProfile(config, 'a'), /inheritance cycle/);
});

test('known context profiles map to explicit token budget classes', () => {
  assert.equal(budgetNameForContextProfile('resume-minimal'), 'resume');
  assert.equal(budgetNameForContextProfile('review'), 'review');
  assert.throws(() => budgetNameForContextProfile('custom'), /no token budget mapping/);
});
