import assert from 'node:assert/strict';
import test from 'node:test';

import { createEvent, serializeEvent } from '../dist/index.js';

test('event serialization preserves stable schema metadata', () => {
  const event = createEvent({
    type: 'run.started',
    timestamp: '2026-09-19T20:00:00.000Z',
    runId: 'run-1',
    payload: { source: 'test' },
  });

  const parsed = JSON.parse(serializeEvent(event));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.runId, 'run-1');
  assert.equal(parsed.type, 'run.started');
});
