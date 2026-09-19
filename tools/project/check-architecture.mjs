import fs from 'node:fs/promises';
import path from 'node:path';

import { findRepoRoot } from './lib/state.mjs';

const root = await findRepoRoot();

const expectedPackages = new Map([
  ['apps/control-plane', '@freehighlander/control-plane'],
  ['apps/web', '@freehighlander/web'],
  ['packages/orchestration', '@freehighlander/orchestration'],
  ['packages/governance', '@freehighlander/governance'],
  ['packages/model-runtime', '@freehighlander/model-runtime'],
  ['packages/evidence', '@freehighlander/evidence'],
  ['packages/telemetry', '@freehighlander/telemetry'],
  ['packages/persistence', '@freehighlander/persistence'],
  ['packages/contracts', '@freehighlander/contracts'],
]);

const failures = [];

for (const [directory, expectedName] of expectedPackages) {
  const packageFile = path.join(root, directory, 'package.json');

  try {
    const pkg = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    if (pkg.name !== expectedName) {
      failures.push(`${directory} must be named ${expectedName}`);
    }
  } catch {
    failures.push(`missing or invalid ${directory}/package.json`);
  }
}

try {
  await fs.access(path.join(root, 'packages', 'core'));
  failures.push('packages/core is forbidden: use bounded platform contexts');
} catch {
  // expected
}

const legacyRoot = path.join(root, 'automation', 'legacy-v2');
try {
  const entries = await fs.readdir(legacyRoot, { recursive: true });
  const implementationFiles = entries.filter(
    (entry) => typeof entry === 'string' && !entry.endsWith('README.md'),
  );
  if (implementationFiles.length > 0) {
    failures.push(
      'automation/legacy-v2 must remain documentation-only until FH-01B and accepted #207',
    );
  }
} catch {
  failures.push('automation/legacy-v2 placeholder is required');
}

if (failures.length > 0) {
  console.error('Architecture check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture check PASS');
