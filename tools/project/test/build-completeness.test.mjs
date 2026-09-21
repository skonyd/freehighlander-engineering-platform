import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeBuildCompleteness } from '../lib/build-completeness.mjs';

const baseConfig = {
  compilerOptions: {
    declaration: true,
    sourceMap: true,
  },
};

async function fixture({
  tsconfig = {
    compilerOptions: { rootDir: 'src', outDir: 'dist' },
    include: ['src/**/*.ts'],
  },
  sources = ['index.ts'],
  outputs = ['index.js', 'index.d.ts', 'index.js.map'],
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-build-completeness-'));
  const directory = path.join(root, 'packages', 'fixture');
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await mkdir(path.join(directory, 'dist'), { recursive: true });
  await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify(tsconfig));

  for (const source of sources) {
    const absolute = path.join(directory, 'src', source);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, 'export const value = 1;\n');
  }

  for (const output of outputs) {
    const absolute = path.join(directory, 'dist', output);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, 'generated\n');
  }

  return {
    root,
    workspace: {
      name: '@freehighlander/fixture',
      directory,
      relativeDirectory: 'packages/fixture',
      manifest: {
        name: '@freehighlander/fixture',
        scripts: { build: 'tsc -p tsconfig.json' },
      },
    },
  };
}

test('each source module requires js declaration and source-map artifacts', async () => {
  const { root, workspace } = await fixture();

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.deepEqual(result, {
      valid: true,
      errors: [],
      workspaceCount: 1,
      sourceModuleCount: 1,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('nested source paths map deterministically into dist', async () => {
  const { root, workspace } = await fixture({
    sources: ['nested/module.ts'],
    outputs: ['nested/module.js', 'nested/module.d.ts', 'nested/module.js.map'],
  });

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.sourceModuleCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing generated artifacts fail closed', async () => {
  const { root, workspace } = await fixture({
    outputs: ['index.js'],
  });

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /index\.d\.ts/);
    assert.match(result.errors.join('\n'), /index\.js\.map/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('workspace tsconfig mapping drift fails closed', async () => {
  const { root, workspace } = await fixture({
    tsconfig: {
      compilerOptions: { rootDir: 'source', outDir: 'build' },
      include: ['source/**/*.ts'],
    },
  });

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /rootDir must remain src/);
    assert.match(result.errors.join('\n'), /outDir must remain dist/);
    assert.match(result.errors.join('\n'), /include must contain src\/\*\*\/\*\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('base declaration and sourceMap compiler guarantees are required', async () => {
  const { root, workspace } = await fixture();

  try {
    const result = await analyzeBuildCompleteness(
      root,
      [workspace],
      { compilerOptions: { declaration: false, sourceMap: false } },
    );
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /declaration=true/);
    assert.match(result.errors.join('\n'), /sourceMap=true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('declaration-only source files are not treated as emitted modules', async () => {
  const { root, workspace } = await fixture({
    sources: ['index.ts', 'ambient.d.ts'],
  });

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.sourceModuleCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build artifact directories or symlinks fail closed', async () => {
  const { root, workspace } = await fixture({
    outputs: ['index.d.ts', 'index.js.map'],
  });
  const jsPath = path.join(workspace.directory, 'dist', 'index.js');
  await mkdir(jsPath, { recursive: true });

  try {
    const result = await analyzeBuildCompleteness(root, [workspace], baseConfig);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /build artifact must be a real file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
