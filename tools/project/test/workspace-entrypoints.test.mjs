import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeWorkspaceEntrypoints, collectEntrypoints } from '../lib/workspace-entrypoints.mjs';

async function fixture(manifest, files = []) {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-entrypoints-'));
  for (const file of files) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, 'export {};\n');
  }
  return {
    root,
    workspace: {
      name: manifest.name ?? '@freehighlander/fixture',
      directory: root,
      relativeDirectory: 'packages/fixture',
      manifest,
    },
  };
}

test('string runtime export and dist type entrypoint pass', async () => {
  const { root, workspace } = await fixture(
    {
      name: '@freehighlander/fixture',
      type: 'module',
      exports: './dist/index.js',
      types: './dist/index.d.ts',
    },
    ['dist/index.js', 'dist/index.d.ts'],
  );

  try {
    const result = await analyzeWorkspaceEntrypoints([workspace]);
    assert.deepEqual(result, { valid: true, errors: [], workspaceCount: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('contracts-style object export with source type entrypoint remains valid', async () => {
  const manifest = {
    name: '@freehighlander/contracts',
    type: 'module',
    exports: {
      '.': {
        types: './src/index.ts',
        default: './dist/index.js',
      },
    },
    types: './src/index.ts',
  };
  const { root, workspace } = await fixture(manifest, ['src/index.ts', 'dist/index.js']);

  try {
    assert.deepEqual(collectEntrypoints(manifest), {
      runtime: ['./dist/index.js'],
      types: ['./src/index.ts'],
    });
    const result = await analyzeWorkspaceEntrypoints([workspace]);
    assert.equal(result.valid, true, result.errors.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing runtime or type entrypoints fail closed', async () => {
  const { root, workspace } = await fixture(
    {
      name: '@freehighlander/fixture',
      type: 'module',
      exports: './dist/index.js',
      types: './dist/index.d.ts',
    },
    [],
  );

  try {
    const result = await analyzeWorkspaceEntrypoints([workspace]);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runtime export outside dist fails even when the file exists', async () => {
  const { root, workspace } = await fixture(
    {
      name: '@freehighlander/fixture',
      type: 'module',
      exports: './src/index.js',
      types: './src/index.d.ts',
    },
    ['src/index.js', 'src/index.d.ts'],
  );

  try {
    const result = await analyzeWorkspaceEntrypoints([workspace]);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /runtime entrypoint must resolve under dist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('absolute parent traversal and node_modules targets fail closed', async () => {
  const cases = ['/tmp/escape.js', '../escape.js', './node_modules/pkg/index.js'];

  for (const target of cases) {
    const { root, workspace } = await fixture(
      {
        name: '@freehighlander/fixture',
        type: 'module',
        exports: target,
        types: './src/index.ts',
      },
      ['src/index.ts'],
    );

    try {
      const result = await analyzeWorkspaceEntrypoints([workspace]);
      assert.equal(result.valid, false, target);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('directory entrypoints and non-ESM manifests fail closed', async () => {
  const { root, workspace } = await fixture(
    {
      name: '@freehighlander/fixture',
      type: 'commonjs',
      exports: './dist',
      types: './dist',
    },
    [],
  );
  await mkdir(path.join(root, 'dist'), { recursive: true });

  try {
    const result = await analyzeWorkspaceEntrypoints([workspace]);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /type=module/);
    assert.match(result.errors.join('\n'), /target must be a file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
