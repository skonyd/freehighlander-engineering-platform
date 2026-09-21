import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseDataPolicyYaml,
  prepareProviderEgress,
} from '@freehighlander/governance';
import {
  createHardeningEvent,
  parseEvent,
  serializeEvent,
} from '@freehighlander/telemetry';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const policy = parseDataPolicyYaml(
  fs.readFileSync(path.join(root, '.freehighlander', 'data-policy.yaml'), 'utf8'),
);

test('provider egress preparation emits telemetry-compatible metadata without raw payloads', () => {
  const prepared = prepareProviderEgress(policy, {
    packetId: 'packet-integration-001',
    providerId: 'provider-integration',
    classification: 'PUBLIC',
    remote: true,
    payload: {
      safe: 'visible',
      apiKey: 'must-not-survive',
    },
  });

  const event = createHardeningEvent({
    type: 'provider.egress.decision',
    timestamp: '2026-09-21T15:00:00.000Z',
    runId: 'run-egress-integration',
    payload: prepared.telemetryPayload,
  });

  const restored = parseEvent(serializeEvent(event));
  assert.equal(restored.type, 'provider.egress.decision');
  assert.equal(restored.payload.outcome, 'ALLOW');
  assert.equal(restored.payload.reasonCode, 'PUBLIC_REMOTE_ALLOWED');

  const serialized = JSON.stringify(restored);
  assert.equal(serialized.includes('must-not-survive'), false);
  assert.equal(serialized.includes('"sanitizedPayload"'), false);
  assert.equal(serialized.includes('"apiKey"'), false);
});

test('denied SECRET egress records metadata only and no content hash', () => {
  const prepared = prepareProviderEgress(policy, {
    packetId: 'packet-secret-001',
    providerId: 'provider-integration',
    classification: 'SECRET',
    remote: true,
    policyApproved: true,
    providerBindingApproved: true,
    providerBindingId: 'binding-secret-001',
    payload: {
      secret: 'must-never-egress',
    },
  });

  const event = createHardeningEvent({
    type: 'provider.egress.decision',
    timestamp: '2026-09-21T15:00:00.000Z',
    runId: 'run-egress-secret',
    payload: prepared.telemetryPayload,
  });

  assert.equal(prepared.packet, null);
  assert.equal(event.payload.outcome, 'DENY');
  assert.equal(event.payload.reasonCode, 'SECRET_REMOTE_FORBIDDEN');
  assert.equal('contentHash' in event.payload, false);
  assert.equal(JSON.stringify(event).includes('must-never-egress'), false);
});
