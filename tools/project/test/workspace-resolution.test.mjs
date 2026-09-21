import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeWorkspaceResolution } from '../lib/workspace-resolution.mjs';

function workspace(name, relativeDirectory, dependencies = {}) {
  return {
    name,
    relativeDirectory,
    manifest: {
      name,
      version: '0.0.0',
      private: true,
      dependencies,
    },
  };
}

function lockfileFor(workspaces) {
  const packages = {};
  for (const item of workspaces) {
    packages[item.relativeDirectory] = { name: item.name, version: '0.0.0' };
    packages[`node_modules/${item.name}`] = {
      resolved: item.relativeDirectory,
      link: true,
    };
  }
  return { lockfileVersion: 3, packages };
}

test('all internal package identities resolve to their local workspace links', () => {
  const workspaces = [
    workspace('@freehighlander/contracts', 'packages/contracts'),
    workspace('@freehighlander/governance', 'packages/governance', {
      '@freehighlander/contracts': '0.0.0',
    }),
  ];
  const result = analyzeWorkspaceResolution(workspaces, lockfileFor(workspaces));
  assert.deepEqual(result, { valid: true, errors: [], workspaceCount: 2 });
});

test('externalized or registry-shaped internal resolution fails closed', () => {
  const workspaces = [workspace('@freehighlander/contracts', 'packages/contracts')];
  const lockfile = lockfileFor(workspaces);
  lockfile.packages['node_modules/@freehighlander/contracts'] = {
    version: '0.0.0',
    resolved: 'https://registry.npmjs.org/@freehighlander/contracts/-/contracts-0.0.0.tgz',
    integrity: 'sha512-not-local',
  };

  const result = analyzeWorkspaceResolution(workspaces, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /link=true/);
  assert.match(result.errors.join('\n'), /resolved path mismatch/);
  assert.match(result.errors.join('\n'), /registry field version/);
  assert.match(result.errors.join('\n'), /registry field integrity/);
});

test('missing and unknown internal lockfile identities fail closed', () => {
  const workspaces = [workspace('@freehighlander/contracts', 'packages/contracts')];
  const lockfile = lockfileFor(workspaces);
  delete lockfile.packages['node_modules/@freehighlander/contracts'];
  lockfile.packages['node_modules/@freehighlander/unknown'] = {
    resolved: 'packages/unknown',
    link: true,
  };

  const result = analyzeWorkspaceResolution(workspaces, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /missing internal workspace link/);
  assert.match(result.errors.join('\n'), /unknown internal package identity/);
});

test('workspace metadata and resolved local path are identity-bound', () => {
  const workspaces = [workspace('@freehighlander/contracts', 'packages/contracts')];
  const lockfile = lockfileFor(workspaces);
  lockfile.packages['packages/contracts'].name = '@freehighlander/other';
  lockfile.packages['packages/contracts'].version = '9.9.9';
  lockfile.packages['node_modules/@freehighlander/contracts'].resolved = 'packages/other';

  const result = analyzeWorkspaceResolution(workspaces, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /workspace name mismatch/);
  assert.match(result.errors.join('\n'), /workspace version mismatch/);
  assert.match(result.errors.join('\n'), /resolved path mismatch/);
});

test('internal dependency specs must remain exact 0.0.0', () => {
  for (const spec of ['^0.0.0', 'workspace:*', 'file:../contracts', 'latest']) {
    const workspaces = [
      workspace('@freehighlander/contracts', 'packages/contracts'),
      workspace('@freehighlander/governance', 'packages/governance', {
        '@freehighlander/contracts': spec,
      }),
    ];
    const result = analyzeWorkspaceResolution(workspaces, lockfileFor(workspaces));
    assert.equal(result.valid, false, spec);
    assert.match(result.errors.join('\n'), /exact 0.0.0/);
  }
});

test('unknown declared internal dependency fails closed before registry fallback', () => {
  const workspaces = [
    workspace('@freehighlander/governance', 'packages/governance', {
      '@freehighlander/missing': '0.0.0',
    }),
  ];

  const result = analyzeWorkspaceResolution(workspaces, lockfileFor(workspaces));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /declares unknown internal dependency/);
});
