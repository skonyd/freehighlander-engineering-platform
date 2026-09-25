import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDiscoveredQualification,
  grantModelEligibility,
  recordCapabilityProbe,
  recordShadowVerification,
} from '@freehighlander/model-runtime';

import {
  createModelManagementStore,
  findEligibleQualification,
  parseCliArgs,
  previewManagedBinding,
  readModelManagementState,
  refreshManagedProvider,
  removeManagedProvider,
  resolveManagedCredential,
  setManagedProvider,
  writeModelManagementState,
} from '../lib/model-management.mjs';

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'fh-models-'));
}

function managedLocalProvider(id, baseUrl) {
  return {
    id,
    kind: 'OPENAI_COMPATIBLE',
    baseUrl,
    locality: 'LOCAL',
    credentialEnv: null,
  };
}

test('model CLI parser supports commands with and without subcommands', () => {
  assert.deepEqual(parseCliArgs(['status', '--state', '/tmp/state.json']), {
    command: 'status',
    subcommand: undefined,
    options: { state: '/tmp/state.json' },
    positionals: [],
  });
  assert.deepEqual(parseCliArgs(['provider', 'set', '--id', 'local-1', '--capability', 'a', '--capability', 'b']), {
    command: 'provider',
    subcommand: 'set',
    options: { id: 'local-1', capability: ['a', 'b'] },
    positionals: [],
  });
});

test('model management state uses atomic CAS and rejects stale writers', () => {
  const root = tempRoot();
  try {
    const store = createModelManagementStore(root);
    const initial = readModelManagementState(store);
    assert.equal(initial.generation, 0);

    const mutation = setManagedProvider(
      initial.state,
      managedLocalProvider('local-1', 'http://127.0.0.1:11434'),
    );
    const first = writeModelManagementState(store, initial.generation, mutation.state);
    assert.equal(first.generation, 1);

    assert.throws(
      () => writeModelManagementState(store, 0, mutation.state),
      /GENERATION_CONFLICT/,
    );

    const restored = readModelManagementState(store);
    assert.equal(restored.generation, 1);
    assert.equal(restored.state.providers[0].id, 'local-1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider replacement invalidates dependent state instead of silently migrating it', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'model-a' }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    let state = setManagedProvider(
      {
        schemaVersion: 1,
        providers: [],
        catalogs: [],
        qualifications: [],
        publications: [],
        authority: 'NONE',
      },
      managedLocalProvider('local-1', baseUrl),
    ).state;

    const refreshed = await refreshManagedProvider(
      state,
      'local-1',
      '2026-09-25T04:00:00.000Z',
      {},
    );
    state = refreshed.state;
    assert.equal(state.catalogs[0].records[0].modelId, 'model-a');

    const discovered = createDiscoveredQualification({
      providerId: 'local-1',
      modelId: 'model-a',
      catalogHash: state.catalogs[0].hash,
    });
    const probed = recordCapabilityProbe(discovered, {
      evidenceHash: 'a'.repeat(64),
      status: 'PASS',
      probedAt: '2026-09-25T04:01:00.000Z',
    });
    const shadow = recordShadowVerification(probed, {
      evidenceHash: 'b'.repeat(64),
      status: 'PASS',
      verifiedAt: '2026-09-25T04:02:00.000Z',
      role: 'controller',
      riskTier: 'NORMAL',
    });
    const eligible = grantModelEligibility(shadow, {
      role: 'controller',
      riskTier: 'NORMAL',
      grantedAt: '2026-09-25T04:03:00.000Z',
      decisionHash: 'c'.repeat(64),
    });
    state = { ...state, qualifications: [eligible] };

    const preview = previewManagedBinding(
      state,
      {
        role: 'controller',
        risk: 'NORMAL',
        bindingId: 'controller-primary',
        version: '1.0.0',
        provider: 'local-1',
        model: 'model-a',
      },
      {},
    );
    assert.equal(preview.plan.bindings[0].model, 'model-a');
    assert.equal(
      findEligibleQualification(state, 'local-1', 'model-a', 'controller', 'NORMAL').hash,
      eligible.hash,
    );

    const replaced = setManagedProvider(state, {
      ...managedLocalProvider('local-1', baseUrl),
      baseUrl: baseUrl + '/changed',
    });
    assert.equal(replaced.invalidated.catalogs, 1);
    assert.equal(replaced.invalidated.qualifications, 1);
    assert.equal(replaced.state.catalogs.length, 0);
    assert.equal(replaced.state.qualifications.length, 0);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('credential resolution never stores raw values and fails closed when env reference is missing', () => {
  const provider = {
    schemaVersion: 1,
    id: 'remote-1',
    kind: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://example.test',
    locality: 'REMOTE',
    credential: { resolverKind: 'LOCAL_ENV', reference: 'REMOTE_1_API_KEY' },
    authority: 'NONE',
  };

  assert.equal(resolveManagedCredential(provider, { REMOTE_1_API_KEY: 'secret-value' }), 'secret-value');
  assert.throws(() => resolveManagedCredential(provider, {}), /environment variable is unavailable/);
});

test('provider removal is explicit and rejects unknown providers', () => {
  const base = {
    schemaVersion: 1,
    providers: [],
    catalogs: [],
    qualifications: [],
    publications: [],
    authority: 'NONE',
  };
  const state = setManagedProvider(
    base,
    managedLocalProvider('local-1', 'http://127.0.0.1:11434'),
  ).state;
  const removed = removeManagedProvider(state, 'local-1');
  assert.equal(removed.state.providers.length, 0);
  assert.throws(() => removeManagedProvider(removed.state, 'local-1'), /unknown managed provider/);
});
