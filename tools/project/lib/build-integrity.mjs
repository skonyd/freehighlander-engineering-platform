import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function buildOutputManifest(root, workspaceDirectories) {
  const entries = [];

  for (const workspace of [...workspaceDirectories].sort()) {
    const dist = path.join(root, workspace, 'dist');
    let stat;
    try {
      stat = await fs.lstat(dist);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`build workspace missing dist output: ${workspace}`);
      }
      throw error;
    }

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`build output must be a real directory: ${workspace}/dist`);
    }

    const files = await walkFiles(dist);
    if (files.length === 0) {
      throw new Error(`build workspace produced empty dist output: ${workspace}`);
    }

    for (const absolute of files) {
      const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
      const buffer = await fs.readFile(absolute);
      entries.push({
        path: relative,
        size: buffer.byteLength,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      });
    }
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function compareBuildManifests(first, second) {
  const firstByPath = new Map(first.map((entry) => [entry.path, entry]));
  const secondByPath = new Map(second.map((entry) => [entry.path, entry]));
  const errors = [];

  for (const file of [...firstByPath.keys()].sort()) {
    const before = firstByPath.get(file);
    const after = secondByPath.get(file);
    if (!after) {
      errors.push(`missing after rebuild: ${file}`);
      continue;
    }
    if (before.size !== after.size) {
      errors.push(`size changed after rebuild: ${file}`);
    }
    if (before.sha256 !== after.sha256) {
      errors.push(`sha256 changed after rebuild: ${file}`);
    }
  }

  for (const file of [...secondByPath.keys()].sort()) {
    if (!firstByPath.has(file)) {
      errors.push(`unexpected after rebuild: ${file}`);
    }
  }

  return {
    identical: errors.length === 0,
    errors: [...new Set(errors)].sort(),
  };
}

async function walkFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`build output must not contain symlinks: ${absolute}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    } else {
      throw new Error(`unsupported build output entry: ${absolute}`);
    }
  }

  return files;
}
