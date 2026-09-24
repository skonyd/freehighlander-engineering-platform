import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalEffortChoices,
  effortNormalizationCanGrantAuthority,
  normalizeEffortValue,
  resolveProviderEffort,
} from '../dist/index.js';

test('effort normalization exposes stable canonical choices and aliases xhigh', () => {
  assert.deepEqual(canonicalEffortChoices(), [
    'default',
    'none',
    'low',
    'medium',
    'high',
    'extra-high',
  ]);
  assert.equal(normalizeEffortValue(' EXTRA_HIGH '), 'extra-high');
  assert.equal(normalizeEffortValue('xhigh'), 'extra-high');
  assert.equal(effortNormalizationCanGrantAuthority(), false);
});

test('effort resolution validates supported values and maps provider-native values', () => {
  const mapped = resolveProviderEffort('extra-high', {
    supportedEfforts: ['low', 'medium', 'high', 'extra-high'],
    nativeMapping: {
      'extra-high': 'xhigh',
    },
  });

  assert.equal(mapped.normalized, 'extra-high');
  assert.equal(mapped.nativeValue, 'xhigh');
  assert.equal(mapped.omitted, false);

  assert.throws(
    () =>
      resolveProviderEffort('ultra', {
        supportedEfforts: ['low', 'medium', 'high'],
      }),
    /unsupported effort: ultra/,
  );
});

test('default and none efforts omit provider-native reasoning parameter', () => {
  assert.deepEqual(resolveProviderEffort('default'), {
    requested: 'default',
    normalized: 'default',
    omitted: true,
  });
  assert.deepEqual(resolveProviderEffort('none'), {
    requested: 'none',
    normalized: 'none',
    omitted: true,
  });
});

test('provider-specific supported values pass through when explicitly allowed', () => {
  const result = resolveProviderEffort('thinking-8192', {
    supportedEfforts: ['thinking-4096', 'thinking-8192'],
  });
  assert.equal(result.nativeValue, 'thinking-8192');
});

test('empty effort and empty native mapping fail closed', () => {
  assert.throws(() => normalizeEffortValue('   '), /effort is required/);
  assert.throws(
    () =>
      resolveProviderEffort('high', {
        nativeMapping: { high: '   ' },
      }),
    /native effort mapping for high is empty/,
  );
});
