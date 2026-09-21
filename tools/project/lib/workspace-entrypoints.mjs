import fs from 'node:fs/promises';
import path from 'node:path';

export async function analyzeWorkspaceEntrypoints(workspaces) {
  const errors = [];

  for (const workspace of workspaces) {
    const manifest = workspace.manifest ?? {};
    const workspaceRoot = workspace.directory;

    if (manifest.type !== 'module') {
      errors.push(`workspace ${workspace.name} must remain type=module`);
    }

    const entrypoints = collectEntrypoints(manifest);
    if (!entrypoints.runtime.length) {
      errors.push(`workspace ${workspace.name} must declare a runtime export entrypoint`);
    }
    if (!entrypoints.types.length) {
      errors.push(`workspace ${workspace.name} must declare a types entrypoint`);
    }

    for (const target of entrypoints.runtime) {
      const validation = await validateTarget(workspaceRoot, target, true);
      for (const error of validation) errors.push(`${workspace.name}: ${error}`);
    }

    for (const target of entrypoints.types) {
      const validation = await validateTarget(workspaceRoot, target, false);
      for (const error of validation) errors.push(`${workspace.name}: ${error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    workspaceCount: workspaces.length,
  };
}

export function collectEntrypoints(manifest) {
  const runtime = new Set();
  const types = new Set();

  if (typeof manifest.exports === 'string') {
    runtime.add(manifest.exports);
  } else if (
    manifest.exports &&
    typeof manifest.exports === 'object' &&
    !Array.isArray(manifest.exports)
  ) {
    collectExportObject(manifest.exports, runtime, types);
  }

  if (typeof manifest.types === 'string') types.add(manifest.types);

  return {
    runtime: [...runtime].sort(),
    types: [...types].sort(),
  };
}

function collectExportObject(value, runtime, types) {
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      if (key === 'types') types.add(child);
      else if (key === 'default' || key === 'import' || key === '.' || key.startsWith('.'))
        runtime.add(child);
      continue;
    }
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      collectExportObject(child, runtime, types);
    }
  }
}

async function validateTarget(workspaceRoot, target, runtime) {
  const errors = [];

  if (typeof target !== 'string' || !target.startsWith('./')) {
    return [`entrypoint must be a relative ./ path: ${String(target)}`];
  }
  if (target.includes('node_modules')) {
    return [`entrypoint must not target node_modules: ${target}`];
  }

  const absolute = path.resolve(workspaceRoot, target);
  const relative = path.relative(workspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [`entrypoint escapes workspace boundary: ${target}`];
  }
  if (runtime && !normalize(target).startsWith('./dist/')) {
    errors.push(`runtime entrypoint must resolve under dist/: ${target}`);
  }

  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      errors.push(`entrypoint target does not exist: ${target}`);
      return errors;
    }
    throw error;
  }

  if (!stat.isFile()) {
    errors.push(`entrypoint target must be a file: ${target}`);
  }

  return errors;
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}
