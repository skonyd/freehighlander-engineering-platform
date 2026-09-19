import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RoleRegistry,
  roleRegistryCanGrantAuthority,
  roleSupportsRiskTier,
  toolPermission,
} from '../dist/index.js';

const advisoryYaml = `
id: repo-analyst
version: 1.0.0
purpose: Analyze repository evidence
authority:
  - ADVISORY
allowedActions:
  - read
  - search
forbiddenActions:
  - merge
allowedRiskTiers:
  - NORMAL
  - HIGH
promptContract: prompts/repo-analyst@1
inputContract: contracts/repo-analysis-input@1
outputContract: contracts/repo-analysis-output@1
evidencePolicy: evidence/default@1
sandboxPolicy: sandbox/read-only@1
independenceGroupRequired: true
`;

test('YAML role package is version-pinned and snapshot hash is deterministic', () => {
  const left = new RoleRegistry();
  const right = new RoleRegistry();
  const policy = { principalKind: 'MODEL', allowedAuthorities: ['ADVISORY'] };

  const a = left.registerYaml(advisoryYaml, policy);
  const b = right.registerYaml(advisoryYaml, policy);

  assert.equal(a.id, 'repo-analyst');
  assert.equal(a.version, '1.0.0');
  assert.equal(a.hash, b.hash);
  assert.equal(a.independenceGroupRequired, true);
  assert.equal(a.authorityGrantedByRegistry, false);
  assert.equal(roleRegistryCanGrantAuthority(), false);
});

test('published role id@version is immutable', () => {
  const registry = new RoleRegistry();
  const policy = { principalKind: 'MODEL', allowedAuthorities: ['ADVISORY'] };
  registry.registerYaml(advisoryYaml, policy);

  assert.throws(() => registry.registerYaml(advisoryYaml, policy), /duplicate role package/);
  assert.throws(() => registry.get('repo-analyst', '2.0.0'), /unknown role package/);
});

test('manifest authority cannot exceed registration policy', () => {
  const registry = new RoleRegistry();

  assert.throws(
    () =>
      registry.registerYaml(
        advisoryYaml.replace('ADVISORY', 'FINAL_REVIEWER'),
        { principalKind: 'MODEL', allowedAuthorities: ['ADVISORY'] },
      ),
    /exceeds registration policy/,
  );
});

test('human and system authority cannot be self-granted by model principal', () => {
  for (const authority of ['HUMAN_APPROVER', 'SYSTEM_POLICY']) {
    const registry = new RoleRegistry();
    assert.throws(
      () =>
        registry.registerYaml(advisoryYaml.replace('ADVISORY', authority), {
          principalKind: 'MODEL',
          allowedAuthorities: [authority],
        }),
      /requires a .* principal/,
    );
  }
});

test('unknown tool permission defaults to DENY and forbidden wins', () => {
  const registry = new RoleRegistry();
  const role = registry.registerYaml(advisoryYaml, {
    principalKind: 'MODEL',
    allowedAuthorities: ['ADVISORY'],
  });
  const manifest = registry.get(role.id, role.version);

  assert.equal(toolPermission(manifest, 'read'), 'ALLOW');
  assert.equal(toolPermission(manifest, 'merge'), 'DENY');
  assert.equal(toolPermission(manifest, 'unknown-action'), 'DENY');
  assert.equal(toolPermission(manifest, ''), 'DENY');
});

test('risk-tier compatibility is explicit', () => {
  const registry = new RoleRegistry();
  const snap = registry.registerYaml(advisoryYaml, {
    principalKind: 'MODEL',
    allowedAuthorities: ['ADVISORY'],
  });
  const role = registry.get(snap.id, snap.version);

  assert.equal(roleSupportsRiskTier(role, 'NORMAL'), true);
  assert.equal(roleSupportsRiskTier(role, 'HIGH'), true);
  assert.equal(roleSupportsRiskTier(role, 'CRITICAL'), false);
});

test('schema validation fails closed for malformed role YAML', () => {
  const registry = new RoleRegistry();
  assert.throws(
    () =>
      registry.registerYaml(
        'id: Bad Role\nversion: nope\nauthority: [ADVISORY]',
        { principalKind: 'MODEL', allowedAuthorities: ['ADVISORY'] },
      ),
  );
});
