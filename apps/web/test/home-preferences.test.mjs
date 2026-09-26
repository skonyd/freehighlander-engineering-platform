import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CORE_HOME_UI_PREFERENCES,
  coreHomeAttentionSeverityVisible,
  coreHomeTimestampInWindow,
  coreHomeUiPreferencesCanGrantAuthority,
  coreHomeUiPreferencesCanInvokeModel,
  parseCoreHomeUiPreferences,
  serializeCoreHomeUiPreferences,
} from '../dist/index.js';

test('Core Home UI preferences parse deterministically and reject unknown values', () => {
  assert.deepEqual(parseCoreHomeUiPreferences(null), DEFAULT_CORE_HOME_UI_PREFERENCES);

  assert.deepEqual(
    parseCoreHomeUiPreferences({
      schemaVersion: 1,
      attentionFilter: 'ERROR_PLUS',
      timeWindow: 'LAST_24H',
      advancedOpen: true,
      ignored: 'value',
    }),
    {
      schemaVersion: 1,
      attentionFilter: 'ERROR_PLUS',
      timeWindow: 'LAST_24H',
      advancedOpen: true,
    },
  );

  assert.deepEqual(
    parseCoreHomeUiPreferences({
      schemaVersion: 1,
      attentionFilter: 'INVALID',
      timeWindow: 'INVALID',
      advancedOpen: 'yes',
    }),
    DEFAULT_CORE_HOME_UI_PREFERENCES,
  );
});

test('Core Home UI preferences serialize in a stable minimal shape', () => {
  assert.equal(
    serializeCoreHomeUiPreferences({
      schemaVersion: 1,
      attentionFilter: 'WARNING_PLUS',
      timeWindow: 'LAST_7D',
      advancedOpen: true,
    }),
    '{"schemaVersion":1,"attentionFilter":"WARNING_PLUS","timeWindow":"LAST_7D","advancedOpen":true}',
  );
});

test('attention filtering uses deterministic severity thresholds', () => {
  assert.equal(coreHomeAttentionSeverityVisible('INFO', 'ALL'), true);
  assert.equal(coreHomeAttentionSeverityVisible('INFO', 'WARNING_PLUS'), false);
  assert.equal(coreHomeAttentionSeverityVisible('WARNING', 'WARNING_PLUS'), true);
  assert.equal(coreHomeAttentionSeverityVisible('WARNING', 'ERROR_PLUS'), false);
  assert.equal(coreHomeAttentionSeverityVisible('ERROR', 'ERROR_PLUS'), true);
  assert.equal(coreHomeAttentionSeverityVisible('CRITICAL', 'CRITICAL'), true);
});

test('time-window filtering is deterministic and fail-closed for malformed timestamps', () => {
  const now = Date.parse('2026-09-26T12:00:00.000Z');

  assert.equal(coreHomeTimestampInWindow('2026-09-26T01:00:00.000Z', 'TODAY', now), true);
  assert.equal(coreHomeTimestampInWindow('2026-09-25T23:59:59.999Z', 'TODAY', now), false);
  assert.equal(coreHomeTimestampInWindow('2026-09-25T13:00:00.000Z', 'LAST_24H', now), true);
  assert.equal(coreHomeTimestampInWindow('2026-09-25T11:00:00.000Z', 'LAST_24H', now), false);
  assert.equal(coreHomeTimestampInWindow('2026-09-20T12:00:00.000Z', 'LAST_7D', now), true);
  assert.equal(coreHomeTimestampInWindow('not-a-date', 'LAST_7D', now), false);
});

test('UI preference state cannot invoke models or grant authority', () => {
  assert.equal(coreHomeUiPreferencesCanInvokeModel(), false);
  assert.equal(coreHomeUiPreferencesCanGrantAuthority(), false);
});
