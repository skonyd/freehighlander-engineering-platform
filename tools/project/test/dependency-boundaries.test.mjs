import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkWorkspaceDependencyBoundaries,
  findDependencyCycles,
} from '../lib/dependency-boundaries.mjs';

async function fixture(workspaces) {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-dependency-boundary-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['apps/*', 'packages/*'] }),
  );

  for (const workspace of workspaces) {
    const directory = path.join(root, workspace.directory);
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: workspace.name,
        private: true,
        ...(workspace.dependencies ? { dependencies: workspace.dependencies } : {}),
      }),
    );
    await writeFile(path.join(directory, 'src', 'index.ts'), workspace.source ?? 'export {};');
  }

  return root;
}

test('valid package-to-package and app-to-package dependencies pass', async () => {
  const root = await fixture([
    {
      directory: 'packages/contracts',
      name: '@freehighlander/contracts',
    },
    {
      directory: 'packages/governance',
      name: '@freehighlander/governance',
      dependencies: { '@freehighlander/contracts': '0.0.0' },
      source: "import '@freehighlander/contracts';",
    },
    {
      directory: 'apps/web',
      name: '@freehighlander/web',
      dependencies: { '@freehighlander/governance': '0.0.0' },
      source: "import '@freehighlander/governance';",
    },
  ]);

  try {
    const result = await checkWorkspaceDependencyBoundaries(root);
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.workspaceCount, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('undeclared internal source imports fail closed', async () => {
  const root = await fixture([
    {
      directory: 'packages/contracts',
      name: '@freehighlander/contracts',
    },
    {
      directory: 'packages/governance',
      name: '@freehighlander/governance',
      source: "import { thing } from '@freehighlander/contracts'; void thing;",
    },
  ]);

  try {
    const result = await checkWorkspaceDependencyBoundaries(root);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /without declaring it/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unknown internal declarations and imports fail closed', async () => {
  const root = await fixture([
    {
      directory: 'packages/governance',
      name: '@freehighlander/governance',
      dependencies: { '@freehighlander/missing': '0.0.0' },
      source: "import '@freehighlander/also-missing';",
    },
  ]);

  try {
    const result = await checkWorkspaceDependencyBoundaries(root);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /declares unknown internal dependency/);
    assert.match(result.errors.join('\n'), /imports unknown internal package/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('packages must not depend on apps', async () => {
  const root = await fixture([
    {
      directory: 'apps/web',
      name: '@freehighlander/web',
    },
    {
      directory: 'packages/governance',
      name: '@freehighlander/governance',
      dependencies: { '@freehighlander/web': '0.0.0' },
      source: "import '@freehighlander/web';",
    },
  ]);

  try {
    const result = await checkWorkspaceDependencyBoundaries(root);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /must not depend on app workspace/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('internal dependency cycles are deterministic and fail closed', async () => {
  const root = await fixture([
    {
      directory: 'packages/a',
      name: '@freehighlander/a',
      dependencies: { '@freehighlander/b': '0.0.0' },
      source: "import '@freehighlander/b';",
    },
    {
      directory: 'packages/b',
      name: '@freehighlander/b',
      dependencies: { '@freehighlander/a': '0.0.0' },
      source: "import '@freehighlander/a';",
    },
  ]);

  try {
    const first = await checkWorkspaceDependencyBoundaries(root);
    const second = await checkWorkspaceDependencyBoundaries(root);
    assert.deepEqual(first, second);
    assert.equal(first.valid, false);
    assert.match(first.errors.join('\n'), /dependency cycle/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cycle normalization is stable regardless of graph insertion order', () => {
  const first = findDependencyCycles(
    new Map([
      ['@freehighlander/a', ['@freehighlander/b']],
      ['@freehighlander/b', ['@freehighlander/a']],
    ]),
  );
  const second = findDependencyCycles(
    new Map([
      ['@freehighlander/b', ['@freehighlander/a']],
      ['@freehighlander/a', ['@freehighlander/b']],
    ]),
  );

  assert.deepEqual(first, second);
});
