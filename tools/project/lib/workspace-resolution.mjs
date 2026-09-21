import path from 'node:path';

const INTERNAL_PREFIX = '@freehighlander/';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

export function analyzeWorkspaceResolution(workspaces, lockfile) {
  const errors = [];
  const byName = new Map();

  for (const workspace of workspaces) {
    if (typeof workspace.name !== 'string' || !workspace.name.startsWith(INTERNAL_PREFIX)) {
      errors.push(`workspace ${workspace.relativeDirectory} must use ${INTERNAL_PREFIX} package identity`);
      continue;
    }
    if (byName.has(workspace.name)) {
      errors.push(`duplicate internal workspace identity: ${workspace.name}`);
      continue;
    }
    byName.set(workspace.name, workspace);
  }

  const packages = lockfile?.packages;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
    return {
      valid: false,
      errors: ['package-lock.json must contain a packages object'],
      workspaceCount: workspaces.length,
    };
  }

  for (const [name, workspace] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const workspaceEntry = packages[workspace.relativeDirectory];
    if (!workspaceEntry) {
      errors.push(`lockfile missing workspace metadata entry: ${workspace.relativeDirectory}`);
    } else {
      if (workspaceEntry.name !== name) {
        errors.push(`lockfile workspace name mismatch for ${workspace.relativeDirectory}`);
      }
      if (workspaceEntry.version !== workspace.manifest.version) {
        errors.push(`lockfile workspace version mismatch for ${name}`);
      }
    }

    const linkPath = `node_modules/${name}`;
    const linkEntry = packages[linkPath];
    if (!linkEntry) {
      errors.push(`lockfile missing internal workspace link: ${linkPath}`);
    } else {
      if (linkEntry.link !== true) {
        errors.push(`internal workspace must resolve as link=true: ${name}`);
      }
      if (normalizePath(linkEntry.resolved) !== normalizePath(workspace.relativeDirectory)) {
        errors.push(`internal workspace resolved path mismatch for ${name}`);
      }
      for (const forbidden of ['version', 'integrity']) {
        if (forbidden in linkEntry) {
          errors.push(`internal workspace link must not carry registry field ${forbidden}: ${name}`);
        }
      }
    }

    for (const field of DEPENDENCY_FIELDS) {
      const declared = workspace.manifest[field];
      if (!declared || typeof declared !== 'object' || Array.isArray(declared)) continue;

      for (const [dependency, spec] of Object.entries(declared)) {
        if (!dependency.startsWith(INTERNAL_PREFIX)) continue;
        if (!byName.has(dependency)) {
          errors.push(`workspace ${name} declares unknown internal dependency ${dependency}`);
          continue;
        }
        if (spec !== '0.0.0') {
          errors.push(`internal dependency spec must be exact 0.0.0: ${name} -> ${dependency}`);
        }
      }
    }
  }

  for (const lockPath of Object.keys(packages).sort()) {
    if (!lockPath.startsWith('node_modules/@freehighlander/')) continue;
    const packageName = lockPath.slice('node_modules/'.length);
    if (!byName.has(packageName)) {
      errors.push(`lockfile contains unknown internal package identity: ${packageName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    workspaceCount: workspaces.length,
  };
}

function normalizePath(value) {
  return typeof value === 'string' ? value.replaceAll('\\', '/').replace(/^\.\//, '') : '';
}
