import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzePublishSafety } from '../lib/publish-safety.mjs';

function root(overrides = {}) {
  return {
    name: 'freehighlander-engineering-platform',
    version: '0.0.0',
    private: true,
    scripts: {
      build: 'npm run build --workspaces --if-present',
    },
    ...overrides,
  };
}

function workspace(overrides = {}) {
  return {
    name: '@freehighlander/governance',
    relativeDirectory: 'packages/governance',
    manifest: {
      name: '@freehighlander/governance',
      version: '0.0.0',
      private: true,
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'node --test test/*.test.mjs',
      },
    },
    ...overrides,
  };
}

test('private pre-release workspace manifests pass', () => {
  const result = analyzePublishSafety(root(), [workspace()]);
  assert.deepEqual(result, {
    valid: true,
    errors: [],
    workspaceCount: 1,
  });
});

test('public or versioned workspace manifests fail closed', () => {
  for (const manifestPatch of [
    { private: false },
    { private: undefined },
    { version: '1.0.0' },
    { publishConfig: { access: 'public' } },
  ]) {
    const candidate = workspace();
    candidate.manifest = { ...candidate.manifest, ...manifestPatch };
    assert.equal(analyzePublishSafety(root(), [candidate]).valid, false);
  }
});

test('publish lifecycle scripts fail closed', () => {
  for (const scriptName of [
    'prepublish',
    'prepublishOnly',
    'publish',
    'postpublish',
    'prepack',
    'postpack',
    'prepare',
    'preinstall',
    'install',
    'postinstall',
  ]) {
    const candidate = workspace();
    candidate.manifest = {
      ...candidate.manifest,
      scripts: { ...candidate.manifest.scripts, [scriptName]: 'echo forbidden' },
    };
    const result = analyzePublishSafety(root(), [candidate]);
    assert.equal(result.valid, false, scriptName);
    assert.match(result.errors.join('\n'), new RegExp(`lifecycle script ${scriptName}`));
  }
});

test('arbitrary scripts cannot invoke npm publish or npm pack', () => {
  for (const command of ['npm publish', 'npm pack', 'echo ok && npm publish --access public']) {
    const candidate = workspace();
    candidate.manifest = {
      ...candidate.manifest,
      scripts: { verify: command },
    };
    const result = analyzePublishSafety(root(), [candidate]);
    assert.equal(result.valid, false, command);
    assert.match(result.errors.join('\n'), /must not invoke npm publish\/pack/);
  }
});

test('root package must remain private pre-release and non-publishing', () => {
  assert.equal(analyzePublishSafety(root({ private: false }), [workspace()]).valid, false);
  assert.equal(analyzePublishSafety(root({ version: '1.0.0' }), [workspace()]).valid, false);
  assert.equal(
    analyzePublishSafety(root({ publishConfig: { registry: 'https://registry.npmjs.org/' } }), [
      workspace(),
    ]).valid,
    false,
  );
  assert.equal(
    analyzePublishSafety(root({ scripts: { release: 'npm publish' } }), [workspace()]).valid,
    false,
  );
});

test('workspace package scope and non-empty discovery are enforced', () => {
  const wrongScope = workspace({
    name: 'governance',
    manifest: {
      name: 'governance',
      version: '0.0.0',
      private: true,
      scripts: {},
    },
  });

  assert.equal(analyzePublishSafety(root(), [wrongScope]).valid, false);
  assert.equal(analyzePublishSafety(root(), []).valid, false);
});
