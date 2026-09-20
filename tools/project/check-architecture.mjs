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
  ['packages/planning', '@freehighlander/planning'],
  ['packages/development', '@freehighlander/development'],
  ['packages/testing', '@freehighlander/testing'],
  ['packages/security', '@freehighlander/security'],
  ['packages/release', '@freehighlander/release'],
  ['packages/operations', '@freehighlander/operations'],
  ['packages/incident', '@freehighlander/incident'],
  ['packages/lineage', '@freehighlander/lineage'],
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

try {
  const webManagementSource = await fs.readFile(
    path.join(root, 'apps', 'web', 'src', 'management.ts'),
    'utf8',
  );
  if (!webManagementSource.includes('export function webCanExecuteManagementIntent(): false')) {
    failures.push('FH-18 web management UI must not own mutation authority');
  }
  if (
    !webManagementSource.includes('export function uiDisconnectCanChangeWorkflowExecution(): false')
  ) {
    failures.push('FH-18 UI disconnect must not change workflow execution');
  }
  if (!webManagementSource.includes("authority: 'CONTROL_PLANE_REQUIRED'")) {
    failures.push('FH-18 management intents must require control-plane authority');
  }
} catch {
  failures.push('missing FH-18 management UI authority guards');
}

try {
  const paritySource = await fs.readFile(
    path.join(root, 'packages', 'evaluation', 'src', 'parity.ts'),
    'utf8',
  );
  if (!paritySource.includes('export function parityCanGrantAuthority(): false')) {
    failures.push('FH-19 parity evidence must not grant authority');
  }
  if (!paritySource.includes('export function parityCanCutOverV3(): false')) {
    failures.push('FH-19 parity PASS must not cut over V3 authority');
  }
  if (!paritySource.includes("'INSUFFICIENT_EVIDENCE'")) {
    failures.push('FH-19 missing evidence must not be treated as parity');
  }
} catch {
  failures.push('missing FH-19 V2/V3 parity authority guards');
}

try {
  const evidencePolicySource = await fs.readFile(
    path.join(root, 'packages', 'evidence', 'src', 'evidence-policy.ts'),
    'utf8',
  );
  if (!evidencePolicySource.includes('export function evidencePolicyCanGrantAuthority(): false')) {
    failures.push('evidence policy validation must remain authority-neutral');
  }
  if (
    !evidencePolicySource.includes(
      'export function evidenceBudgetCanTruncateRequiredEvidence(): false',
    )
  ) {
    failures.push('required evidence must not be truncatable for token budget');
  }
  if (
    !evidencePolicySource.includes("throw new Error('summary substitution must remain disabled')")
  ) {
    failures.push('summary evidence must not replace required raw evidence');
  }
} catch {
  failures.push('missing executable evidence policy guards');
}

try {
  const cutoverSource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'cutover-readiness.ts'),
    'utf8',
  );
  if (!cutoverSource.includes('export function cutoverReadinessCanEnableAuthority(): false')) {
    failures.push('FH-20 readiness evaluation must not enable authority');
  }
  if (
    !cutoverSource.includes('export function cutoverCanBypassFinalReferenceAcceptance(): false')
  ) {
    failures.push('FH-20 cutover must not bypass final V2 reference acceptance');
  }
  if (!cutoverSource.includes("status: reasons.length === 0 ? 'READY' : 'BLOCKED'")) {
    failures.push('FH-20 cutover readiness must fail closed');
  }
} catch {
  failures.push('missing FH-20 cutover readiness guards');
}

try {
  const planningSource = await fs.readFile(
    path.join(root, 'packages', 'planning', 'src', 'index.ts'),
    'utf8',
  );
  if (!planningSource.includes('export function planningCanGrantAuthority(): false')) {
    failures.push('FH-30A planning must remain authority-neutral');
  }
  if (!planningSource.includes('export function planningCanAuthorizeExecution(): false')) {
    failures.push('FH-30A planning readiness must not authorize execution');
  }
  if (!planningSource.includes("errors.push('work item dependency graph must be acyclic')")) {
    failures.push('FH-30A planning dependency graph must fail closed on cycles');
  }
} catch {
  failures.push('missing FH-30A planning authority guards');
}

try {
  const developmentSource = await fs.readFile(
    path.join(root, 'packages', 'development', 'src', 'index.ts'),
    'utf8',
  );
  if (!developmentSource.includes('export function developmentCanGrantAuthority(): false')) {
    failures.push('FH-31A development must remain authority-neutral');
  }
  if (!developmentSource.includes('export function developmentCanExecuteCommands(): false')) {
    failures.push('FH-31A development must not execute commands pre-cutover');
  }
  if (!developmentSource.includes('export function developmentCanMutateGit(): false')) {
    failures.push('FH-31A development must not mutate Git pre-cutover');
  }
  if (!developmentSource.includes('export function developmentCanMergePullRequests(): false')) {
    failures.push('FH-31A development must not merge pull requests pre-cutover');
  }
  if (!developmentSource.includes("readonly sideEffects: 'FORBIDDEN'")) {
    failures.push('FH-31A shadow intents must forbid side effects');
  }
} catch {
  failures.push('missing FH-31A development authority guards');
}

try {
  const testingSource = await fs.readFile(
    path.join(root, 'packages', 'testing', 'src', 'index.ts'),
    'utf8',
  );
  if (!testingSource.includes('export function testingCanGrantAuthority(): false')) {
    failures.push('FH-32A testing must remain authority-neutral');
  }
  if (!testingSource.includes('export function testPassCanAuthorizeMerge(): false')) {
    failures.push('FH-32A test PASS must not authorize merge');
  }
  if (!testingSource.includes('export function testPassCanAuthorizeRelease(): false')) {
    failures.push('FH-32A test PASS must not authorize release');
  }
  if (!testingSource.includes('export function testingCanExecuteProductionMutation(): false')) {
    failures.push('FH-32A testing must not execute production mutation');
  }
  if (!testingSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-32A shadow test gate authority must remain NONE');
  }
} catch {
  failures.push('missing FH-32A testing authority guards');
}

try {
  const securitySource = await fs.readFile(
    path.join(root, 'packages', 'security', 'src', 'index.ts'),
    'utf8',
  );
  if (!securitySource.includes('export function securityCanGrantAuthority(): false')) {
    failures.push('FH-33A security must remain authority-neutral');
  }
  if (!securitySource.includes('export function securityCanWaiveFinding(): false')) {
    failures.push('FH-33A security must not self-waive findings');
  }
  if (!securitySource.includes('export function securityClearCanAuthorizeRelease(): false')) {
    failures.push('FH-33A security CLEAR must not authorize release');
  }
  if (!securitySource.includes('export function securityCanExecuteProductionMutation(): false')) {
    failures.push('FH-33A security must not execute production mutation');
  }
  if (!securitySource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-33A security readiness authority must remain NONE');
  }
} catch {
  failures.push('missing FH-33A security authority guards');
}

try {
  const releaseSource = await fs.readFile(
    path.join(root, 'packages', 'release', 'src', 'index.ts'),
    'utf8',
  );
  if (!releaseSource.includes('export function releaseCanGrantAuthority(): false')) {
    failures.push('FH-34A release must remain authority-neutral');
  }
  if (!releaseSource.includes('export function releaseReadyCanAuthorizeDeployment(): false')) {
    failures.push('FH-34A release readiness must not authorize deployment');
  }
  if (!releaseSource.includes('export function releaseCanPublishTagOrRelease(): false')) {
    failures.push('FH-34A release must not publish tags/releases pre-cutover');
  }
  if (!releaseSource.includes('export function releaseCanExecuteRollback(): false')) {
    failures.push('FH-34A release must not execute rollback pre-cutover');
  }
  if (!releaseSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-34A release readiness authority must remain NONE');
  }
} catch {
  failures.push('missing FH-34A release authority guards');
}

try {
  const operationsSource = await fs.readFile(
    path.join(root, 'packages', 'operations', 'src', 'index.ts'),
    'utf8',
  );
  if (!operationsSource.includes('export function operationsCanGrantAuthority(): false')) {
    failures.push('FH-35A operations must remain authority-neutral');
  }
  if (!operationsSource.includes('export function operationsCanMutateInfrastructure(): false')) {
    failures.push('FH-35A operations must not mutate infrastructure pre-cutover');
  }
  if (!operationsSource.includes('export function operationsCanExecuteIntent(): false')) {
    failures.push('FH-35A operational intents must remain data only');
  }
  if (!operationsSource.includes("readonly sideEffects: 'FORBIDDEN'")) {
    failures.push('FH-35A operational intents must forbid side effects');
  }
  if (!operationsSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-35A operations authority must remain NONE');
  }
} catch {
  failures.push('missing FH-35A operations authority guards');
}

try {
  const incidentSource = await fs.readFile(
    path.join(root, 'packages', 'incident', 'src', 'index.ts'),
    'utf8',
  );
  if (!incidentSource.includes('export function incidentCanGrantAuthority(): false')) {
    failures.push('FH-36A incident must remain authority-neutral');
  }
  if (!incidentSource.includes('export function incidentCanMutateInfrastructure(): false')) {
    failures.push('FH-36A incident must not mutate infrastructure pre-cutover');
  }
  if (!incidentSource.includes('export function incidentCanExecuteOperationalIntent(): false')) {
    failures.push('FH-36A incident must not execute operational intents');
  }
  if (!incidentSource.includes('export function incidentCanAutomaticallyRemediate(): false')) {
    failures.push('FH-36A incident must not automatically remediate pre-cutover');
  }
  if (!incidentSource.includes("readonly automaticRemediation: 'FORBIDDEN'")) {
    failures.push('FH-36A automatic remediation must remain forbidden');
  }
  if (!incidentSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-36A incident authority must remain NONE');
  }
} catch {
  failures.push('missing FH-36A incident authority guards');
}

try {
  const lineageSource = await fs.readFile(
    path.join(root, 'packages', 'lineage', 'src', 'index.ts'),
    'utf8',
  );
  if (!lineageSource.includes('export function lineageCanGrantAuthority(): false')) {
    failures.push('FH-37A lineage must remain authority-neutral');
  }
  if (!lineageSource.includes('export function lineageCanMutateDomain(): false')) {
    failures.push('FH-37A lineage must remain read-only pre-cutover');
  }
  if (
    !lineageSource.includes('export function semanticSearchCanEstablishLineageAuthority(): false')
  ) {
    failures.push('FH-37A semantic search must never establish lineage authority');
  }
  if (!lineageSource.includes('export function lineageRequiresGraphDatabase(): false')) {
    failures.push('FH-37A graph database must remain deferred');
  }
  if (!lineageSource.includes("readonly semanticSearchAuthority: 'FORBIDDEN'")) {
    failures.push('FH-37A semantic search authority must remain FORBIDDEN');
  }
  if (!lineageSource.includes("readonly storageModel: 'RELATIONAL_FIRST'")) {
    failures.push('FH-37A storage must remain relational-first');
  }
  if (!lineageSource.includes("readonly authority: 'NONE'")) {
    failures.push('FH-37A lineage authority must remain NONE');
  }
} catch {
  failures.push('missing FH-37A lineage authority guards');
}

try {
  const dataPolicySource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'data-policy.ts'),
    'utf8',
  );
  if (!dataPolicySource.includes('export function dataPolicyCanGrantAuthority(): false')) {
    failures.push('data-policy enforcement must remain authority-neutral');
  }
  if (!dataPolicySource.includes('export function dataPolicyCanAllowSecretRemoteEgress(): false')) {
    failures.push('SECRET remote egress must remain impossible');
  }
  if (!dataPolicySource.includes("case 'SECRET':")) {
    failures.push('data-policy egress evaluator must explicitly handle SECRET');
  }
  if (!dataPolicySource.includes('redactSensitive')) {
    failures.push('data-policy persistence path must include deterministic redaction');
  }
} catch {
  failures.push('missing executable data-policy enforcement');
}

if (failures.length > 0) {
  console.error('Architecture check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture check PASS');
