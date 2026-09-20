import fs from 'node:fs/promises';
import path from 'node:path';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx']);
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

export async function discoverWorkspacePackages(root) {
  const rootManifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!Array.isArray(rootManifest.workspaces)) {
    throw new Error('root package.json workspaces must be an array');
  }

  const workspaces = [];
  for (const pattern of [...rootManifest.workspaces].sort()) {
    if (typeof pattern !== 'string' || !pattern.endsWith('/*')) {
      throw new Error(`unsupported workspace pattern: ${String(pattern)}`);
    }

    const base = pattern.slice(0, -2);
    const basePath = path.join(root, base);
    let entries;
    try {
      entries = await fs.readdir(basePath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const directory = path.join(basePath, entry.name);
      const manifestPath = path.join(directory, 'package.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        workspaces.push({
          name: manifest.name,
          directory,
          relativeDirectory: path.relative(root, directory).replaceAll(path.sep, '/'),
          kind: base === 'packages' ? 'package' : base === 'apps' ? 'app' : 'other',
          manifest,
        });
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
    }
  }

  return workspaces.sort((left, right) => left.relativeDirectory.localeCompare(right.relativeDirectory));
}

export async function analyzeWorkspaceDependencyBoundaries(root, workspaces) {
  const errors = [];
  const byName = new Map();

  for (const workspace of workspaces) {
    if (typeof workspace.name !== 'string' || !workspace.name.trim()) {
      errors.push(`workspace ${workspace.relativeDirectory} must declare a package name`);
      continue;
    }
    if (byName.has(workspace.name)) {
      errors.push(`duplicate workspace package name: ${workspace.name}`);
      continue;
    }
    byName.set(workspace.name, workspace);
  }

  const graph = new Map();
  for (const workspace of workspaces) {
    if (!workspace.name) continue;
    const declared = declaredDependencies(workspace.manifest);
    const internalEdges = [];

    for (const dependency of [...declared].sort()) {
      if (!dependency.startsWith('@freehighlander/')) continue;
      const target = byName.get(dependency);
      if (!target) {
        errors.push(
          `workspace ${workspace.name} declares unknown internal dependency ${dependency}`,
        );
        continue;
      }
      internalEdges.push(dependency);
      if (workspace.kind === 'package' && target.kind === 'app') {
        errors.push(
          `package workspace ${workspace.name} must not depend on app workspace ${dependency}`,
        );
      }
    }

    graph.set(workspace.name, internalEdges.sort());

    const imports = await collectInternalSourceImports(workspace.directory);
    for (const importedPackage of [...imports].sort()) {
      if (!byName.has(importedPackage)) {
        errors.push(
          `workspace ${workspace.name} imports unknown internal package ${importedPackage}`,
        );
      } else if (!declared.has(importedPackage)) {
        errors.push(
          `workspace ${workspace.name} imports internal package ${importedPackage} without declaring it`,
        );
      }
    }
  }

  for (const cycle of findDependencyCycles(graph)) {
    errors.push(`internal workspace dependency cycle: ${cycle.join(' -> ')}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    workspaceCount: workspaces.length,
  };
}

export async function checkWorkspaceDependencyBoundaries(root) {
  const workspaces = await discoverWorkspacePackages(root);
  return analyzeWorkspaceDependencyBoundaries(root, workspaces);
}

export function findDependencyCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const visiting = new Set();
  const stack = [];

  const visit = (name) => {
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      const cycle = [...stack.slice(start), name];
      cycles.push(canonicalCycle(cycle));
      return;
    }
    if (visited.has(name)) return;

    visiting.add(name);
    stack.push(name);
    for (const dependency of graph.get(name) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
  };

  for (const name of [...graph.keys()].sort()) visit(name);

  const unique = new Map();
  for (const cycle of cycles) unique.set(cycle.join(' -> '), cycle);
  return [...unique.values()].sort((left, right) => left.join().localeCompare(right.join()));
}

async function collectInternalSourceImports(workspaceDirectory) {
  const sourceDirectory = path.join(workspaceDirectory, 'src');
  const imports = new Set();

  let stat;
  try {
    stat = await fs.stat(sourceDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return imports;
    throw error;
  }
  if (!stat.isDirectory()) return imports;

  for (const file of await walkSourceFiles(sourceDirectory)) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/@freehighlander\/[A-Za-z0-9._-]+/g)) {
      imports.add(match[0]);
    }
  }
  return imports;
}

async function walkSourceFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(fullPath)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function declaredDependencies(manifest) {
  const result = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const name of Object.keys(dependencies)) result.add(name);
  }
  return result;
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) return cycle;

  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ]);
  rotations.sort((left, right) => left.join('\u0000').localeCompare(right.join('\u0000')));
  return [...rotations[0], rotations[0][0]];
}
