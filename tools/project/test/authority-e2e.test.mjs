import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  AUTHORITY_CAPABILITY_REGISTRY_V1,
} from '../../../packages/contracts/dist/index.js';
import {
  AuthorityCapabilityStateStore,
} from '../../../packages/persistence/dist/index.js';
import {
  AuthorityCapabilityExecutionGate,
} from '../../../apps/control-plane/dist/index.js';
import {
  startAuthorityCapabilityHttpServer,
} from '../../../apps/control-plane/bin/authority-server.mjs';
import {
  startDashboardServer,
} from '../../../apps/web/dist/index.js';

const REVISION = 'a'.repeat(40);
const CSRF = 'c'.repeat(64);
const REPOSITORY = 'skonyd/freehighlander-engineering-platform';

async function postAuthority(url, origin, pathname, body, csrfToken = CSRF) {
  const response = await fetch(url + pathname, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-freehighlander-csrf': csrfToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

test('V3 authority plane completes the real default-DENY lifecycle end to end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fh-authority-e2e-'));
  const statePath = join(root, 'authority-capabilities.json');
  const auditPath = join(root, 'authority-events.jsonl');
  const databasePath = join(root, 'dashboard.sqlite');

  let dashboard;
  let authority;
  try {
    dashboard = await startDashboardServer({
      databasePath,
      host: '127.0.0.1',
      port: 0,
    });
    authority = await startAuthorityCapabilityHttpServer({
      statePath,
      auditPath,
      repository: REPOSITORY,
      revision: REVISION,
      approverId: 'acceptance-operator',
      allowedOrigin: dashboard.url,
      csrfToken: CSRF,
      port: 0,
    });

    const settingsResponse = await fetch(dashboard.url + '/settings/authority');
    assert.equal(settingsResponse.status, 200);
    assert.equal(settingsResponse.headers.get('x-freehighlander-mode'), 'read-only');
    const settingsHtml = await settingsResponse.text();
    for (const definition of AUTHORITY_CAPABILITY_REGISTRY_V1) {
      assert.match(settingsHtml, new RegExp('request-' + definition.id));
      assert.match(settingsHtml, new RegExp(definition.label));
    }

    const initial = await (await fetch(authority.url + '/v1/authority')).json();
    assert.equal(initial.generation, 0);
    assert.deepEqual(initial.state.requestedCapabilities, []);
    assert.deepEqual(initial.state.activeCapabilities, []);

    const sessionResponse = await fetch(authority.url + '/v1/authority/session', {
      headers: { origin: dashboard.url },
    });
    assert.equal(sessionResponse.status, 200);
    assert.equal((await sessionResponse.json()).csrfToken, CSRF);

    const blockedActivation = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/activate',
      { capability: 'GIT_WRITE', expectedGeneration: 0 },
    );
    assert.equal(blockedActivation.response.status, 409);
    assert.equal(blockedActivation.payload.result.status, 'BLOCKED');

    const forgedTrust = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/request',
      {
        capability: 'GIT_WRITE',
        requested: true,
        expectedGeneration: 0,
        exactHumanApprovalVerified: true,
      },
    );
    assert.equal(forgedTrust.response.status, 400);
    assert.equal(forgedTrust.payload.error, 'invalid_mutation_input');

    const requested = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/request',
      { capability: 'GIT_WRITE', requested: true, expectedGeneration: 0 },
    );
    assert.equal(requested.response.status, 200);
    assert.equal(requested.payload.result.status, 'APPLIED');
    assert.deepEqual(requested.payload.result.state.requestedCapabilities, ['GIT_WRITE']);
    assert.deepEqual(requested.payload.result.state.activeCapabilities, []);

    const approved = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/approve',
      { capability: 'GIT_WRITE', expectedGeneration: 1 },
    );
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.result.status, 'APPROVED');
    assert.equal(approved.payload.result.approval.revision, REVISION);
    assert.match(approved.payload.result.approval.policyHash, /^[a-f0-9]{64}$/);
    assert.match(approved.payload.result.approval.requestHash, /^[a-f0-9]{64}$/);
    assert.match(approved.payload.result.approval.decisionHash, /^[a-f0-9]{64}$/);

    const activated = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/activate',
      { capability: 'GIT_WRITE', expectedGeneration: 1 },
    );
    assert.equal(activated.response.status, 200);
    assert.equal(activated.payload.result.status, 'APPLIED');
    assert.deepEqual(activated.payload.result.state.activeCapabilities, ['GIT_WRITE']);

    const stateStore = new AuthorityCapabilityStateStore(statePath);
    const gate = new AuthorityCapabilityExecutionGate({
      stateStore,
      expectedRevision: REVISION,
      observeRevision: () => REVISION,
    });
    assert.equal(gate.check('GIT_WRITE').allowed, true);
    assert.equal(gate.check('RELEASE_DEPLOY').allowed, false);

    const staleMutation = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/request',
      { capability: 'RELEASE_DEPLOY', requested: true, expectedGeneration: 1 },
    );
    assert.equal(staleMutation.response.status, 409);
    assert.equal(staleMutation.payload.result.status, 'CONFLICT');

    const deactivated = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/deactivate',
      { capability: 'GIT_WRITE', expectedGeneration: 2 },
    );
    assert.equal(deactivated.response.status, 200);
    assert.equal(deactivated.payload.result.status, 'APPLIED');
    assert.deepEqual(deactivated.payload.result.state.activeCapabilities, []);
    assert.equal(gate.check('GIT_WRITE').allowed, false);

    const reapproved = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/approve',
      { capability: 'GIT_WRITE', expectedGeneration: 3 },
    );
    assert.equal(reapproved.response.status, 200);
    const reactivated = await postAuthority(
      authority.url,
      dashboard.url,
      '/v1/authority/activate',
      { capability: 'GIT_WRITE', expectedGeneration: 3 },
    );
    assert.equal(reactivated.response.status, 200);
    assert.equal(gate.check('GIT_WRITE').allowed, true);

    await authority.close();
    authority = await startAuthorityCapabilityHttpServer({
      statePath,
      auditPath,
      repository: REPOSITORY,
      revision: REVISION,
      approverId: 'acceptance-operator',
      allowedOrigin: dashboard.url,
      csrfToken: CSRF,
      port: 0,
    });

    const restarted = await (await fetch(authority.url + '/v1/authority')).json();
    assert.deepEqual(restarted.state.requestedCapabilities, ['GIT_WRITE']);
    assert.deepEqual(restarted.state.activeCapabilities, []);
    assert.equal(gate.check('GIT_WRITE').allowed, false);

    const auditLines = (await readFile(auditPath, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const auditTypes = new Set(auditLines.map((event) => event.type));
    assert.equal(auditTypes.has('authority.requested'), true);
    assert.equal(auditTypes.has('authority.approved'), true);
    assert.equal(auditTypes.has('authority.activated'), true);
    assert.equal(auditTypes.has('authority.deactivated'), true);
    for (const event of auditLines) {
      assert.equal(event.revision.repository, REPOSITORY);
      assert.equal(event.revision.headSha, REVISION);
      assert.equal(event.payload.exactRevision, REVISION);
      assert.equal(event.payload.principalId, 'acceptance-operator');
    }
    assert.doesNotMatch(await readFile(auditPath, 'utf8'), new RegExp(CSRF));
  } finally {
    if (authority) await authority.close();
    if (dashboard) await dashboard.close();
    await rm(root, { recursive: true, force: true });
  }
});
