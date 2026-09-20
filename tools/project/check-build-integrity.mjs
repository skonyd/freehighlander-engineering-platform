import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOutputManifest, compareBuildManifests } from './lib/build-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
const workspaces = await discoverBuildWorkspaces(rootPackage.workspaces ?? []);

if (!gitignore.split(/\r?\n/).includes('dist/')) {
  fail(['.gitignore must ignore dist/ build outputs']);
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split('\0')
  .filter(Boolean)
  .filter((file) => file === 'dist' || file.startsWith('dist/') || file.includes('/dist/'));

if (tracked.length > 0) {
  fail(tracked.map((file) => `build output must not be git-tracked: ${file}`));
}

let first;
try {
  first = await buildOutputManifest(root, workspaces);
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}

for (const workspace of workspaces) {
  await fs.rm(path.join(root, workspace, 'dist'), { recursive: true, force: true });
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rebuild = spawnSync(npmCommand, ['run', 'build'], {
  cwd: root,
  encoding: 'utf8',
});

if (rebuild.stdout) process.stdout.write(rebuild.stdout);
if (rebuild.stderr) process.stderr.write(rebuild.stderr);
if (rebuild.error) fail([`rebuild runner error: ${rebuild.error.message}`]);
if (rebuild.status !== 0) fail([`rebuild failed with exit ${rebuild.status}`]);

let second;
try {
  second = await buildOutputManifest(root, workspaces);
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}

const comparison = compareBuildManifests(first, second);
if (!comparison.identical) fail(comparison.errors);

console.log(
  `Build integrity check PASS (${workspaces.length} workspaces, ${second.length} artifacts)`,
);

async function discoverBuildWorkspaces(patterns) {
  const discovered = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      fail([`unsupported workspace pattern for build integrity: ${pattern}`]);
    }

    const parent = pattern.slice(0, -2);
    const parentPath = path.join(root, parent);
    const entries = await fs.readdir(parentPath, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const workspace = path.posix.join(parent.replaceAll('\\', '/'), entry.name);
      const manifestPath = path.join(root, workspace, 'package.json');

      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (typeof manifest.scripts?.build === 'string') discovered.push(workspace);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }

  if (discovered.length === 0) fail(['no build workspaces discovered']);
  return discovered.sort();
}

function fail(errors) {
  console.error('Build integrity check FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
