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
  ['packages/v2-compat', '@freehighlander/v2-compat'],
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
      'automation/legacy-v2 must remain documentation-only until FH-01B2 accepted promotion',
    );
  }
} catch {
  failures.push('automation/legacy-v2 placeholder is required');
}

// FH-01B1 provisional guard: compatibility code may exist, but it must stay
// explicitly non-authoritative until FH-01B2 reconciles the final accepted #207.
try {
  const v2CompatSource = await fs.readFile(
    path.join(root, 'packages', 'v2-compat', 'src', 'index.ts'),
    'utf8',
  );
  const requiredFragments = [
    "sha: '0e70f4a9680fcc5c287b7926f2aa20170c79f47d'",
    "referenceStatus: 'PROVISIONAL'",
    "authority: 'DISABLED'",
    "export const AUTHORITATIVE_ARTIFACT_KIND = 'full' as const",
    'export function authorityPromotionAllowed(): false',
  ];
  for (const fragment of requiredFragments) {
    if (!v2CompatSource.includes(fragment)) {
      failures.push(`FH-01B1 provisional guard missing: ${fragment}`);
    }
  }
  if (/referenceStatus:\s*'ACCEPTED'/.test(v2CompatSource)) {
    failures.push('FH-01B1 cannot mark the V2 reference ACCEPTED');
  }
  if (/authority:\s*'ENABLED'/.test(v2CompatSource)) {
    failures.push('FH-01B1 cannot enable V2 authority');
  }
} catch {
  failures.push('missing FH-01B1 provisional compatibility source');
}

if (failures.length > 0) {
  console.error('Architecture check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture check PASS');
