import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

const workflow = await fs.readFile(
  path.join(root, '.github', 'workflows', 'fh-ci.yml'),
  'utf8',
);
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));

if (!workflow.includes('runs-on: ubuntu-24.04')) {
  failures.push('CI runner must be pinned to ubuntu-24.04');
}
if (workflow.includes('runs-on: ubuntu-latest')) {
  failures.push('CI must not use mutable ubuntu-latest');
}

const actionUses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(
  (match) => match[1],
);
if (actionUses.length === 0) {
  failures.push('CI must contain explicitly pinned GitHub Actions');
}
for (const action of actionUses) {
  if (!/@[a-f0-9]{40}$/.test(action)) {
    failures.push(`GitHub Action must be pinned to a full commit SHA: ${action}`);
  }
}

for (const mutableReference of ['actions/checkout@v4', 'actions/setup-node@v4']) {
  if (workflow.includes(mutableReference)) {
    failures.push(`CI must not use mutable action reference: ${mutableReference}`);
  }
}

if (!workflow.includes('node-version: 24.21.0')) {
  failures.push('CI Node version must remain pinned to 24.21.0');
}
if (!workflow.includes('npm install --global npm@11.19.1 --ignore-scripts --no-audit --no-fund')) {
  failures.push('CI npm bootstrap must pin npm 11.19.1 and disable lifecycle scripts');
}
if (!workflow.includes('npm ci --ignore-scripts --no-audit --no-fund')) {
  failures.push('CI dependency installation must use npm ci with lifecycle scripts disabled');
}
if (workflow.includes('npm install --package-lock=false')) {
  failures.push('CI must not bypass the npm lockfile');
}

if (packageJson.packageManager !== 'npm@11.19.1') {
  failures.push('packageManager must pin npm@11.19.1');
}
if (lockfile.lockfileVersion !== 3) {
  failures.push('package-lock.json must use lockfileVersion 3');
}
if (lockfile.name !== packageJson.name || lockfile.version !== packageJson.version) {
  failures.push('package-lock.json root identity must match package.json');
}

const lockRoot = lockfile.packages?.[''];
if (!lockRoot) {
  failures.push('package-lock.json must contain the root package entry');
} else {
  for (const field of ['dependencies', 'devDependencies']) {
    const expected = packageJson[field] ?? {};
    const actual = lockRoot[field] ?? {};
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`package-lock root ${field} must exactly match package.json`);
    }
  }
}

if (failures.length > 0) {
  console.error('CI supply-chain check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('CI supply-chain check PASS');
