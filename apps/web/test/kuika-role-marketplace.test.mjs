import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_ROLE_MARKETPLACE_HTML,
  buildFhKuikaSolutionPackInstallPlanV1,
  createDashboardServer,
  diffFhKuikaMarketplaceRoleVersionsV1,
  getFhKuikaMarketplaceRoleV1,
  getFhKuikaSolutionPackV1,
  listFhKuikaMarketplaceRolesV1,
  listFhKuikaSolutionPacksV1,
  roleMarketplaceCanGrantAuthority,
  roleMarketplaceCanInstallDirectly,
  roleMarketplacePageCanGrantAuthority,
  roleMarketplacePageCanInstall,
  roleMarketplacePageCanInvokeModel,
  roleVersionDiffCanRollback,
  roleVersionDiffCanUpdate,
  solutionPackPlanCanActivate,
} from '../dist/index.js';

test('Role Marketplace exposes pinned provenance without install authority', () => {
  const roles = listFhKuikaMarketplaceRolesV1();
  assert.equal(roles.length, 10);
  assert.equal(new Set(roles.map((role) => role.id)).size, roles.length);

  for (const role of roles) {
    assert.equal(role.version, '1.0.0');
    assert.equal(role.provenance.pinned, true);
    assert.equal(role.provenance.source, 'BUILT_IN_CATALOG');
    assert.equal(role.provenance.digest.length, 64);
    assert.equal(role.installAuthority, 'NONE');
  }

  assert.equal(roleMarketplaceCanInstallDirectly(), false);
  assert.equal(roleMarketplaceCanGrantAuthority(), false);
});

test('review roles preserve independence and forbidden mutation boundaries', () => {
  const security = getFhKuikaMarketplaceRoleV1('security-reviewer');
  assert.ok(security);
  assert.ok(security.authority.includes('FINAL_REVIEWER'));
  assert.equal(security.independenceGroupRequired, true);
  assert.ok(security.forbiddenActions.includes('git.merge'));
  assert.ok(security.forbiddenActions.includes('repository.write'));
});

test('solution pack plan is deterministic and cannot activate', () => {
  const pack = getFhKuikaSolutionPackV1('security-review');
  assert.ok(pack);

  const plan = buildFhKuikaSolutionPackInstallPlanV1(
    pack,
    ['security-reviewer@1.0.0', 'test-reviewer@1.0.0'],
    ['github', 'trivy-mcp'],
  );

  assert.deepEqual(plan.missingRoleRefs, []);
  assert.deepEqual(plan.missingConnectorRefs, []);
  assert.equal(plan.readyForCoreReview, true);
  assert.equal(plan.installAuthority, 'NONE');
  assert.equal(plan.activationAuthorized, false);
  assert.equal(solutionPackPlanCanActivate(), false);

  const incomplete = buildFhKuikaSolutionPackInstallPlanV1(pack, [], []);
  assert.equal(incomplete.readyForCoreReview, false);
  assert.ok(incomplete.missingRoleRefs.length > 0);
  assert.ok(incomplete.missingConnectorRefs.length > 0);
});

test('Marketplace UI stays one Build surface and exposes no install action', () => {
  assert.match(FH_KUIKA_ROLE_MARKETPLACE_HTML, /Roles & Solution Packs/);
  assert.match(FH_KUIKA_ROLE_MARKETPLACE_HTML, /Role Marketplace/);
  assert.match(FH_KUIKA_ROLE_MARKETPLACE_HTML, /Solution Packs/);
  assert.match(FH_KUIKA_ROLE_MARKETPLACE_HTML, /cannot register or activate/);
  assert.doesNotMatch(FH_KUIKA_ROLE_MARKETPLACE_HTML, /id="install"/);
  assert.equal(roleMarketplacePageCanInvokeModel(), false);
  assert.equal(roleMarketplacePageCanGrantAuthority(), false);
  assert.equal(roleMarketplacePageCanInstall(), false);
});

test('Marketplace HTTP routes expose role and solution pack planning as GET-only', async () => {
  const server = createDashboardServer({ databasePath: '/tmp/fh-kuika-role-market-no-db.sqlite' });

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

    const page = await fetch(base + '/modules/fh-kuika/build/roles');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Roles & Solution Packs/);

    const roles = await (await fetch(base + '/api/modules/fh-kuika/roles')).json();
    assert.equal(roles.roles.length, 10);

    const role = await (
      await fetch(base + '/api/modules/fh-kuika/roles/security-reviewer')
    ).json();
    assert.equal(role.role.installAuthority, 'NONE');

    const packs = await (
      await fetch(base + '/api/modules/fh-kuika/solution-packs')
    ).json();
    assert.equal(packs.packs.length, 5);

    const plan = await (
      await fetch(base + '/api/modules/fh-kuika/solution-packs/security-review/plan')
    ).json();
    assert.equal(plan.plan.installAuthority, 'NONE');
    assert.equal(plan.plan.activationAuthorized, false);

    const denied = await fetch(base + '/api/modules/fh-kuika/roles', { method: 'POST' });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});


test('role version diff marks authority-sensitive changes breaking and plans rollback only', () => {
  const before = getFhKuikaMarketplaceRoleV1('security-reviewer');
  assert.ok(before);

  const after = {
    ...before,
    version: '2.0.0',
    allowedRiskTiers: ['NORMAL', 'HIGH'],
    sandboxPolicy: 'reviewer-expanded-v2',
  };

  const diff = diffFhKuikaMarketplaceRoleVersionsV1(before, after);
  assert.equal(diff.roleId, 'security-reviewer');
  assert.equal(diff.fromVersion, '1.0.0');
  assert.equal(diff.toVersion, '2.0.0');
  assert.equal(diff.breaking, true);
  assert.ok(diff.changedFields.includes('allowedRiskTiers'));
  assert.ok(diff.changedFields.includes('sandboxPolicy'));
  assert.equal(diff.rollbackRef, 'security-reviewer@1.0.0');
  assert.equal(diff.authority, 'NONE');
  assert.equal(diff.updateAuthorized, false);
  assert.equal(diff.rollbackAuthorized, false);
  assert.equal(roleVersionDiffCanUpdate(), false);
  assert.equal(roleVersionDiffCanRollback(), false);

  assert.throws(
    () =>
      diffFhKuikaMarketplaceRoleVersionsV1(before, {
        ...after,
        id: 'different-role',
      }),
    /same role id/,
  );
});
