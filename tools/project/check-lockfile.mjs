import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeLockfileProvenance } from './lib/lockfile-provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let packageJson;
let lockfile;

try {
  packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  lockfile = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
} catch (error) {
  console.error('Lockfile provenance check FAIL');
  console.error(
    `- unable to read package metadata: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const result = analyzeLockfileProvenance(lockfile, packageJson);

if (!result.valid) {
  console.error('Lockfile provenance check FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Lockfile provenance check PASS (${result.externalPackageCount} external packages)`,
);
