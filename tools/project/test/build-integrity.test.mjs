import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildOutputManifest, compareBuildManifests } from '../lib/build-integrity.mjs';

test('manifest hashing is deterministic regardless of file creation order', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-build-integrity-'));

  try {
    await mkdir(path.join(root, 'packages', 'a', 'dist', 'nested'), { recursive: true });
    await writeFile(path.join(root, 'packages', 'a', 'dist', 'z.js'), 'export const z = 1;\n');
    await writeFile(
      path.join(root, 'packages', 'a', 'dist', 'nested', 'a.js'),
      'export const a = 1;\n',
    );

    const first = await buildOutputManifest(root, ['packages/a']);
    const second = await buildOutputManifest(root, ['packages/a']);

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.map((entry) => entry.path),
      ['packages/a/dist/nested/a.js', 'packages/a/dist/z.js'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('manifest comparison detects missing extra size and digest drift', () => {
  const first = [
    { path: 'a.js', size: 1, sha256: 'a'.repeat(64) },
    { path: 'b.js', size: 2, sha256: 'b'.repeat(64) },
    { path: 'c.js', size: 3, sha256: 'c'.repeat(64) },
  ];
  const second = [
    { path: 'a.js', size: 1, sha256: 'd'.repeat(64) },
    { path: 'b.js', size: 9, sha256: 'b'.repeat(64) },
    { path: 'extra.js', size: 1, sha256: 'e'.repeat(64) },
  ];

  const result = compareBuildManifests(first, second);
  assert.equal(result.identical, false);
  assert.match(result.errors.join('\n'), /sha256 changed after rebuild: a\.js/);
  assert.match(result.errors.join('\n'), /size changed after rebuild: b\.js/);
  assert.match(result.errors.join('\n'), /missing after rebuild: c\.js/);
  assert.match(result.errors.join('\n'), /unexpected after rebuild: extra\.js/);
});

test('identical manifests pass exactly', () => {
  const manifest = [{ path: 'a.js', size: 1, sha256: 'a'.repeat(64) }];
  assert.deepEqual(compareBuildManifests(manifest, structuredClone(manifest)), {
    identical: true,
    errors: [],
  });
});

test('missing empty or symlinked dist outputs fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freehighlander-build-integrity-'));

  try {
    await assert.rejects(
      () => buildOutputManifest(root, ['packages/missing']),
      /missing dist output/,
    );

    await mkdir(path.join(root, 'packages', 'empty', 'dist'), { recursive: true });
    await assert.rejects(
      () => buildOutputManifest(root, ['packages/empty']),
      /empty dist output/,
    );

    await mkdir(path.join(root, 'packages', 'linked'), { recursive: true });
    await symlink(
      path.join(root, 'packages', 'empty', 'dist'),
      path.join(root, 'packages', 'linked', 'dist'),
    );
    await assert.rejects(
      () => buildOutputManifest(root, ['packages/linked']),
      /real directory/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
