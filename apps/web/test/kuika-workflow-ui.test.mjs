import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createDashboardServer,
  workflowStudioDraftCanExecute,
  workflowStudioDraftCanGrantAuthority,
  workflowStudioDraftCanPublishDirectly,
} from '../dist/index.js';

test('FH-KUIKA Workflow Studio route serves authority-neutral local draft UI', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fh-kuika-workflow-ui-'));
  const server = createDashboardServer({
    databasePath: path.join(root, 'missing.sqlite'),
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;

    const response = await fetch(base + '/modules/fh-kuika/build/workflows');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-freehighlander-mode'), 'read-only');

    const html = await response.text();
    assert.match(html, /Workflow Studio/);
    assert.match(html, /Local draft canvas/);
    assert.match(html, /Publish and Execute are intentionally unavailable/);
    assert.match(html, /Risk tier/);
    assert.match(html, /Token budget/);
    assert.match(html, /Cost budget USD/);
    assert.match(html, /Required evidence/);
    assert.match(html, /Tool permissions/);
    assert.match(html, /Approval policy/);

    const head = await fetch(base + '/modules/fh-kuika/build/workflows', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }

  assert.equal(workflowStudioDraftCanGrantAuthority(), false);
  assert.equal(workflowStudioDraftCanPublishDirectly(), false);
  assert.equal(workflowStudioDraftCanExecute(), false);
});
