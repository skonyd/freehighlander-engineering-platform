import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = path.join(root, 'tools', 'project', 'coverage-baseline.json');

const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

const failures = [];
const workspaces = await discoverWorkspaces(rootPackage.workspaces ?? []);
const configured = new Set(Object.keys(baseline.workspaces ?? {}));
const explicitlyUntested = new Set(baseline.explicitlyUntested ?? []);

if (baseline.schemaVersion !== 1) {
  failures.push('coverage baseline schemaVersion must be 1');
}
if (baseline.nodeVersion !== '24.21.0') {
  failures.push('coverage baseline must remain bound to Node 24.21.0');
}

for (const workspace of workspaces) {
  const testFiles = await listTestFiles(path.join(root, workspace, 'test'));
  const hasTests = testFiles.length > 0;
  const threshold = baseline.workspaces?.[workspace];

  if (hasTests) {
    if (!threshold) {
      failures.push(`tested workspace missing coverage baseline: ${workspace}`);
      continue;
    }
    if (explicitlyUntested.has(workspace)) {
      failures.push(`tested workspace cannot remain explicitly untested: ${workspace}`);
    }
    validateThreshold(workspace, threshold);
  } else {
    if (threshold) {
      failures.push(`coverage baseline is stale for workspace without tests: ${workspace}`);
    }
    if (!explicitlyUntested.has(workspace)) {
      failures.push(`workspace without tests must be explicitly inventoried: ${workspace}`);
    }
  }
}

for (const workspace of configured) {
  if (!workspaces.includes(workspace)) {
    failures.push(`coverage baseline references missing workspace: ${workspace}`);
  }
}
for (const workspace of explicitlyUntested) {
  if (!workspaces.includes(workspace)) {
    failures.push(`explicitly untested inventory references missing workspace: ${workspace}`);
  }
}

if (failures.length > 0) fail();

let coverageFailed = false;

for (const workspace of workspaces) {
  const threshold = baseline.workspaces?.[workspace];
  if (!threshold) {
    console.log(`COVERAGE UNTESTED ${workspace}`);
    continue;
  }

  const dist = path.join(root, workspace, 'dist');
  if (!(await containsJavaScript(dist))) {
    failures.push(`workspace must be built before coverage check: ${workspace}`);
    coverageFailed = true;
    continue;
  }

  const testFiles = await listTestFiles(path.join(root, workspace, 'test'));
  const args = [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-include=dist/**/*.js',
    `--test-coverage-lines=${threshold.minimum.lines}`,
    `--test-coverage-branches=${threshold.minimum.branches}`,
    `--test-coverage-functions=${threshold.minimum.functions}`,
    ...testFiles.map((file) => path.relative(path.join(root, workspace), file)),
  ];

  console.log(
    `COVERAGE CHECK ${workspace} lines>=${threshold.minimum.lines} branches>=${threshold.minimum.branches} functions>=${threshold.minimum.functions}`,
  );

  const result = spawnSync(process.execPath, args, {
    cwd: path.join(root, workspace),
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    failures.push(`${workspace} coverage runner error: ${result.error.message}`);
    coverageFailed = true;
  } else if (result.status !== 0) {
    failures.push(`${workspace} coverage threshold/test run failed with exit ${result.status}`);
    coverageFailed = true;
  }
}

if (coverageFailed || failures.length > 0) fail();

console.log(
  `Native coverage check PASS (${configured.size} covered workspaces, ${explicitlyUntested.size} explicitly untested)`,
);

function validateThreshold(workspace, threshold) {
  for (const metric of ['lines', 'branches', 'functions']) {
    const observed = threshold?.observed?.[metric];
    const minimum = threshold?.minimum?.[metric];

    if (typeof observed !== 'number' || observed < 0 || observed > 100) {
      failures.push(`${workspace} invalid observed ${metric} coverage`);
      continue;
    }
    if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) {
      failures.push(`${workspace} minimum ${metric} coverage must be an integer 0..100`);
      continue;
    }
    if (minimum !== Math.floor(observed)) {
      failures.push(`${workspace} minimum ${metric} coverage must equal floor(observed baseline)`);
    }
  }
}

async function discoverWorkspaces(patterns) {
  const discovered = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      failures.push(`unsupported workspace pattern for coverage inventory: ${pattern}`);
      continue;
    }

    const parent = pattern.slice(0, -2);
    const parentPath = path.join(root, parent);
    const entries = await fs.readdir(parentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspace = path.posix.join(parent.replaceAll('\\', '/'), entry.name);
      try {
        await fs.access(path.join(root, workspace, 'package.json'));
        discovered.push(workspace);
      } catch {
        // Non-workspace directory under the glob parent.
      }
    }
  }

  return discovered.sort();
}

async function listTestFiles(testDirectory) {
  try {
    const entries = await fs.readdir(testDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
      .map((entry) => path.join(testDirectory, entry.name))
      .sort();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function containsJavaScript(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith('.js')) return true;
      if (entry.isDirectory() && (await containsJavaScript(candidate))) return true;
    }
    return false;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function fail() {
  console.error('Native coverage check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
