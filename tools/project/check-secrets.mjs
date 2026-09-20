import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatSecretFindings, scanTrackedRepository } from './lib/secret-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let findings;
try {
  findings = await scanTrackedRepository(root);
} catch (error) {
  console.error('Tracked secret check FAIL');
  console.error(
    `- scanner execution failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Tracked secret check FAIL');
  for (const finding of formatSecretFindings(findings)) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Tracked secret check PASS');
