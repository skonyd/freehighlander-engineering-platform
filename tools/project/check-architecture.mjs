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
  ['packages/evaluation', '@freehighlander/evaluation'],
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

try {
  const evaluationSource = await fs.readFile(
    path.join(root, 'packages', 'evaluation', 'src', 'index.ts'),
    'utf8',
  );
  if (!evaluationSource.includes('export function shadowCanGrantAuthority(): false')) {
    failures.push('FH-05 shadow evaluation must remain non-authoritative');
  }
  if (!evaluationSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-05 shadow pair authority guard is missing');
  }
} catch {
  failures.push('missing FH-05 shadow evaluation source');
}

try {
  const contextSource = await fs.readFile(
    path.join(root, 'packages', 'orchestration', 'src', 'context-packet.ts'),
    'utf8',
  );
  const runtimeSource = await fs.readFile(
    path.join(root, 'packages', 'model-runtime', 'src', 'token-budget.ts'),
    'utf8',
  );
  if (!contextSource.includes('export function tokenOptimizationCanChangeAuthority(): false')) {
    failures.push('FH-07 token/context optimization must remain authority-neutral');
  }
  if (!runtimeSource.includes('export function tokenBudgetCanAuthorizeEvidenceRemoval(): false')) {
    failures.push('FH-07 token budget must not authorize required-evidence removal');
  }
} catch {
  failures.push('missing FH-07 optimization authority guards');
}

try {
  const roleRegistrySource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'role-registry.ts'),
    'utf8',
  );
  if (!roleRegistrySource.includes('export function roleRegistryCanGrantAuthority(): false')) {
    failures.push('FH-12 role registry must remain authority-neutral');
  }
  if (
    !roleRegistrySource.includes("return role.allowedActions.includes(action) ? 'ALLOW' : 'DENY'")
  ) {
    failures.push('FH-12 unknown tool permission must default to DENY');
  }
} catch {
  failures.push('missing FH-12 role registry authority guards');
}

try {
  const bindingRegistrySource = await fs.readFile(
    path.join(root, 'packages', 'model-runtime', 'src', 'binding-registry.ts'),
    'utf8',
  );
  if (
    !bindingRegistrySource.includes('export function bindingRegistryCanGrantAuthority(): false')
  ) {
    failures.push('FH-11 binding registry must remain authority-neutral');
  }
} catch {
  failures.push('missing FH-11 binding registry authority guard');
}

try {
  const providerCircuitSource = await fs.readFile(
    path.join(root, 'packages', 'model-runtime', 'src', 'circuit-breaker.ts'),
    'utf8',
  );
  if (
    !providerCircuitSource.includes('export function providerCircuitCanChangeAuthority(): false')
  ) {
    failures.push('FH-08 provider circuit breaker must remain authority-neutral');
  }
  if (
    !providerCircuitSource.includes(
      'export function providerCircuitCanTripOnSemanticFailure(): false',
    )
  ) {
    failures.push('FH-08 semantic failures must not trip availability circuit');
  }
} catch {
  failures.push('missing FH-08 provider circuit-breaker authority guards');
}

try {
  const workflowEngineSource = await fs.readFile(
    path.join(root, 'packages', 'orchestration', 'src', 'workflow-engine.ts'),
    'utf8',
  );
  if (
    !workflowEngineSource.includes(
      'export function workflowConfigurationCanGrantAuthority(): false',
    )
  ) {
    failures.push('FH-13 workflow configuration must remain authority-neutral');
  }
  if (!workflowEngineSource.includes("throw new Error('workflow graph must be acyclic')")) {
    failures.push('FH-13 workflow graph cycles must fail closed');
  }
} catch {
  failures.push('missing FH-13 workflow engine authority guards');
}

try {
  const debateEngineSource = await fs.readFile(
    path.join(root, 'packages', 'orchestration', 'src', 'debate-engine.ts'),
    'utf8',
  );
  if (!debateEngineSource.includes('export function debateConsensusCanGrantAuthority(): false')) {
    failures.push('FH-14 debate consensus must remain non-authoritative');
  }
  if (
    !debateEngineSource.includes('export function debateConfigurationCanGrantAuthority(): false')
  ) {
    failures.push('FH-14 debate configuration must remain authority-neutral');
  }
  if (!debateEngineSource.includes("status: 'HUMAN_REQUIRED'")) {
    failures.push('FH-14 unresolved bounded disagreement must escalate to human');
  }
} catch {
  failures.push('missing FH-14 debate/council authority guards');
}

try {
  const policyEngineSource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'policy-engine.ts'),
    'utf8',
  );
  if (!policyEngineSource.includes('export function policyConfigurationCanSelfApprove(): false')) {
    failures.push('FH-15 policy configuration must not self-approve');
  }
  if (!policyEngineSource.includes('export function modelCanActAsHumanApprover(): false')) {
    failures.push('FH-15 model principals must not act as human approvers');
  }
  if (
    !policyEngineSource.includes(
      "throw new Error('human approval decision requires HUMAN principal')",
    )
  ) {
    failures.push('FH-15 human approval must require a HUMAN principal');
  }
} catch {
  failures.push('missing FH-15 policy/human approval authority guards');
}

try {
  const artifactLineageSource = await fs.readFile(
    path.join(root, 'packages', 'evidence', 'src', 'artifact-lineage.ts'),
    'utf8',
  );
  if (
    !artifactLineageSource.includes('export function artifactLineageCanGrantAuthority(): false')
  ) {
    failures.push('FH-16 artifact lineage must remain authority-neutral');
  }
  if (!artifactLineageSource.includes('missing lineage artifact')) {
    failures.push('FH-16 lineage verification must fail closed on missing parents');
  }
  if (!artifactLineageSource.includes('lineage cycle detected')) {
    failures.push('FH-16 lineage verification must fail closed on cycles');
  }
} catch {
  failures.push('missing FH-16 artifact-lineage authority guards');
}

try {
  const replaySource = await fs.readFile(
    path.join(root, 'packages', 'orchestration', 'src', 'replay-engine.ts'),
    'utf8',
  );
  if (!replaySource.includes('export function replayOrSimulationCanGrantAuthority')) {
    failures.push('FH-17 replay/simulation authority guard is missing');
  }
  if (!replaySource.includes('checkpoint replay manifest mismatch')) {
    failures.push('FH-17 recovery checkpoint must be replay-manifest bound');
  }
  if (!replaySource.includes('divergent: observedInputHash !== outcome.inputHash')) {
    failures.push('FH-17 replay divergence must be explicit');
  }
} catch {
  failures.push('missing FH-17 replay/recovery authority guards');
}

if (failures.length > 0) {
  console.error('Architecture check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture check PASS');
