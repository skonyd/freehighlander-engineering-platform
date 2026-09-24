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

try {
  const sandboxPolicySource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'sandbox-policy.ts'),
    'utf8',
  );
  if (!sandboxPolicySource.includes('export function sandboxPolicyCanGrantAuthority(): false')) {
    failures.push('sandbox policy enforcement must remain authority-neutral');
  }
  if (!sandboxPolicySource.includes('export function promptCanExpandSandboxPermissions(): false')) {
    failures.push('prompt text must not expand sandbox permissions');
  }
  if (
    !sandboxPolicySource.includes(
      'export function modelIdentityCanExpandSandboxPermissions(): false',
    )
  ) {
    failures.push('model identity must not expand sandbox permissions');
  }
  if (!sandboxPolicySource.includes("request.capability === 'UNKNOWN'")) {
    failures.push('unknown sandbox capability must fail closed');
  }
  if (!sandboxPolicySource.includes('isWithinRepository')) {
    failures.push('sandbox filesystem access must enforce repository boundary');
  }
} catch {
  failures.push('missing executable sandbox-policy enforcement');
}

try {
  const retentionSource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'retention-policy.ts'),
    'utf8',
  );
  if (!retentionSource.includes('export function retentionPlanCanDeleteData(): false')) {
    failures.push('retention planner must not grant deletion authority');
  }
  if (!retentionSource.includes('export function retentionPlanCanDeleteAuditData(): false')) {
    failures.push('retention planner must never auto-delete AUDIT data');
  }
  if (!retentionSource.includes("'REVIEW_ORPHAN'")) {
    failures.push('retention planner must review orphans before deletion');
  }
  if (!retentionSource.includes("'PURGE_CANDIDATE'")) {
    failures.push('retention planner must remain dry-run candidate planning');
  }
} catch {
  failures.push('missing retention/privacy dry-run planner');
}

try {
  const sqliteStoreSource = await fs.readFile(
    path.join(root, 'packages', 'persistence', 'src', 'sqlite-telemetry-store.ts'),
    'utf8',
  );
  if (!sqliteStoreSource.includes('integrityCheck(): SqliteIntegrityResult')) {
    failures.push('SQLite persistence must expose deterministic integrity verification');
  }
  if (!sqliteStoreSource.includes('async backupTo(targetPath: string)')) {
    failures.push('SQLite persistence must expose verified native backup');
  }
  if (!sqliteStoreSource.includes('restoreSqliteTelemetryBackupToNewFile')) {
    failures.push('SQLite restore must be explicit and offline/new-file only');
  }
  if (!sqliteStoreSource.includes('backup target already exists')) {
    failures.push('SQLite backup must not overwrite an existing target');
  }
  if (!sqliteStoreSource.includes('live/existing databases are never overwritten')) {
    failures.push('SQLite restore must not overwrite live/existing databases');
  }
} catch {
  failures.push('missing SQLite backup/restore/integrity hardening');
}

try {
  const digitalThreadIntegration = await fs.readFile(
    path.join(root, 'tools', 'project', 'test', 'digital-thread-integration.test.mjs'),
    'utf8',
  );
  for (const packageName of [
    '@freehighlander/planning',
    '@freehighlander/development',
    '@freehighlander/testing',
    '@freehighlander/security',
    '@freehighlander/release',
    '@freehighlander/operations',
    '@freehighlander/incident',
    '@freehighlander/lineage',
  ]) {
    if (!digitalThreadIntegration.includes(packageName)) {
      failures.push(`digital-thread integration must cover ${packageName}`);
    }
  }
  if (!digitalThreadIntegration.includes('cross-module revision mismatches fail closed')) {
    failures.push('digital-thread integration must fail closed on revision mismatch');
  }
  if (!digitalThreadIntegration.includes("snapshot.authority, 'NONE'")) {
    failures.push('digital-thread integration must assert authority NONE across module snapshots');
  }
} catch {
  failures.push('missing FH-30A..FH-37A cross-module digital-thread integration suite');
}

try {
  const telemetrySource = await fs.readFile(
    path.join(root, 'packages', 'telemetry', 'src', 'index.ts'),
    'utf8',
  );
  for (const eventType of [
    'policy.decision',
    'data.redaction',
    'provider.egress.decision',
    'sandbox.decision',
    'retention.plan.action',
    'persistence.integrity.checked',
    'persistence.backup.completed',
    'persistence.restore.completed',
    'lineage.validation.failed',
  ]) {
    if (!telemetrySource.includes(`'${eventType}'`)) {
      failures.push(`hardening telemetry event is missing: ${eventType}`);
    }
  }
  if (!telemetrySource.includes('hardeningPayloadKeys')) {
    failures.push('hardening telemetry must use a bounded metadata allowlist');
  }
  if (!telemetrySource.includes('hardening telemetry payload field is not allowed')) {
    failures.push('hardening telemetry must reject arbitrary payload fields');
  }
} catch {
  failures.push('missing hardening observability event contracts');
}

try {
  const adversarialSource = await fs.readFile(
    path.join(root, 'tools', 'project', 'test', 'adversarial-fail-closed.test.mjs'),
    'utf8',
  );
  for (const invariant of [
    'adversarial planning mutations fail closed',
    'combined development scope, revision, evidence and side-effect corruption fails closed',
    'policy and sandbox layers deny privilege escalation independently',
    'lineage rejects multiple simultaneous provenance and identity corruptions',
    'telemetry parsers and hardening payloads reject malformed or secret-bearing input',
  ]) {
    if (!adversarialSource.includes(invariant)) {
      failures.push(`adversarial fail-closed coverage is missing: ${invariant}`);
    }
  }
  if (adversarialSource.includes('Math.random')) {
    failures.push('adversarial hardening tests must remain deterministic');
  }
} catch {
  failures.push('missing deterministic adversarial fail-closed hardening suite');
}

try {
  const dependencyChecker = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'dependency-boundaries.mjs'),
    'utf8',
  );
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!dependencyChecker.includes('internal workspace dependency cycle')) {
    failures.push('dependency boundary checker must reject internal workspace cycles');
  }
  if (!dependencyChecker.includes('must not depend on app workspace')) {
    failures.push('dependency boundary checker must reject packages depending on apps');
  }
  if (!dependencyChecker.includes('without declaring it')) {
    failures.push('dependency boundary checker must enforce internal import declarations');
  }
  if (!dependencyChecker.includes('imports unknown internal package')) {
    failures.push('dependency boundary checker must reject unknown internal imports');
  }
  if (rootPackage.scripts?.['check:dependencies'] !== 'node tools/project/check-dependencies.mjs') {
    failures.push('root package must expose check:dependencies');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:dependencies')) {
    failures.push('npm run verify must include dependency boundary enforcement');
  }
} catch {
  failures.push('missing workspace dependency-boundary enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.access(path.join(root, 'tools', 'project', 'check-doc-drift.mjs'));
  if (rootPackage.scripts?.['check:docs'] !== 'node tools/project/check-doc-drift.mjs') {
    failures.push('root package must expose check:docs');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:docs')) {
    failures.push('npm run verify must include documentation drift enforcement');
  }
} catch {
  failures.push('missing documentation drift enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.access(path.join(root, 'package-lock.json'));
  await fs.access(path.join(root, 'tools', 'project', 'check-ci-supply-chain.mjs'));
  if (rootPackage.scripts?.['check:ci'] !== 'node tools/project/check-ci-supply-chain.mjs') {
    failures.push('root package must expose check:ci');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:ci')) {
    failures.push('npm run verify must include CI supply-chain enforcement');
  }
} catch {
  failures.push('missing deterministic CI supply-chain enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const secretScanner = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'secret-scan.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-secrets.mjs'));

  for (const invariant of [
    'PRIVATE_KEY_PEM',
    'AWS_ACCESS_KEY_ID',
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'TRACKED_ENV_FILE',
  ]) {
    if (!secretScanner.includes(invariant)) {
      failures.push(`tracked-secret scanner missing invariant: ${invariant}`);
    }
  }

  if (rootPackage.scripts?.['check:secrets'] !== 'node tools/project/check-secrets.mjs') {
    failures.push('root package must expose check:secrets');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:secrets')) {
    failures.push('npm run verify must include tracked-secret enforcement');
  }
} catch {
  failures.push('missing deterministic tracked-secret enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const coverageBaseline = JSON.parse(
    await fs.readFile(path.join(root, 'tools', 'project', 'coverage-baseline.json'), 'utf8'),
  );
  const coverageCheck = await fs.readFile(
    path.join(root, 'tools', 'project', 'check-coverage.mjs'),
    'utf8',
  );

  if (coverageBaseline.schemaVersion !== 1) {
    failures.push('coverage baseline schema must remain version 1');
  }
  if (coverageBaseline.nodeVersion !== '24.21.0') {
    failures.push('coverage baseline must remain bound to Node 24.21.0');
  }
  if (Object.keys(coverageBaseline.workspaces ?? {}).length !== 19) {
    failures.push('coverage baseline must inventory all 19 workspaces');
  }
  if ((coverageBaseline.explicitlyUntested ?? []).length !== 0) {
    failures.push('coverage baseline must not contain explicitly untested workspaces');
  }
  for (const invariant of [
    '--experimental-test-coverage',
    '--test-coverage-lines=',
    '--test-coverage-branches=',
    '--test-coverage-functions=',
    'Math.floor(observed)',
  ]) {
    if (!coverageCheck.includes(invariant)) {
      failures.push(`native coverage gate missing invariant: ${invariant}`);
    }
  }
  if (rootPackage.scripts?.['check:coverage'] !== 'node tools/project/check-coverage.mjs') {
    failures.push('root package must expose check:coverage');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:coverage')) {
    failures.push('npm run verify must include native coverage enforcement');
  }
} catch {
  failures.push('missing native coverage regression enforcement');
}

try {
  const secretBrokerSource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'secret-broker.ts'),
    'utf8',
  );
  const securityBoundary = await fs.readFile(
    path.join(root, 'docs', 'security', 'EXECUTION-AND-DATA-BOUNDARIES.md'),
    'utf8',
  );

  for (const invariant of [
    "readonly classification: 'SECRET'",
    'readonly persistValue: false',
    'readonly remoteModelEgress: false',
    "readonly retentionClass: 'EPHEMERAL'",
    'readonly sandboxDecision: SandboxPermissionDecision',
    'export function secretBrokerCanGrantAuthority(): false',
    'export function secretValueCanBePersisted(): false',
    'export function secretValueCanReachRemoteModel(): false',
    'export function promptCanRequestRawSecretValue(): false',
  ]) {
    if (!secretBrokerSource.includes(invariant)) {
      failures.push(`secret-handle contract missing invariant: ${invariant}`);
    }
  }

  for (const forbidden of ['readonly value: string', 'readonly locator: string']) {
    if (secretBrokerSource.includes(forbidden)) {
      failures.push(`secret-handle contract must not expose raw secret metadata: ${forbidden}`);
    }
  }

  for (const marker of [
    'SecretHandle',
    'role ∩ workflow ∩ sandbox SECRET_ACCESS',
    'actual secret backend resolution/injection adapters are intentionally not implemented',
  ]) {
    if (!securityBoundary.includes(marker)) {
      failures.push(`security boundary missing secret-broker marker: ${marker}`);
    }
  }
} catch {
  failures.push('missing secret-handle / ephemeral-injection hardening contract');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lockfileCheck = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'lockfile-provenance.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-lockfile.mjs'));

  for (const invariant of [
    'https://registry.npmjs.org/',
    'sha512-',
    'hasInstallScript',
    'must not use remote/git/file dependency specifier',
  ]) {
    if (!lockfileCheck.includes(invariant)) {
      failures.push(`lockfile provenance gate missing invariant: ${invariant}`);
    }
  }

  if (rootPackage.scripts?.['check:lockfile'] !== 'node tools/project/check-lockfile.mjs') {
    failures.push('root package must expose check:lockfile');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:lockfile')) {
    failures.push('npm run verify must include lockfile provenance enforcement');
  }
} catch {
  failures.push('missing lockfile provenance/install-script enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const buildIntegrity = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'build-integrity.mjs'),
    'utf8',
  );
  const buildCheck = await fs.readFile(
    path.join(root, 'tools', 'project', 'check-build-integrity.mjs'),
    'utf8',
  );

  for (const invariant of [
    "createHash('sha256')",
    'build output must not contain symlinks',
    'missing after rebuild',
    'unexpected after rebuild',
  ]) {
    if (!buildIntegrity.includes(invariant)) {
      failures.push(`build integrity library missing invariant: ${invariant}`);
    }
  }

  for (const invariant of [
    "execFileSync('git', ['ls-files', '-z']",
    "spawnSync(npmCommand, ['run', 'build']",
    "gitignore.split(/\\r?\\n/).includes('dist/')",
  ]) {
    if (!buildCheck.includes(invariant)) {
      failures.push(`build integrity gate missing invariant: ${invariant}`);
    }
  }

  if (
    rootPackage.scripts?.['check:build-integrity'] !==
    'node tools/project/check-build-integrity.mjs'
  ) {
    failures.push('root package must expose check:build-integrity');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:build-integrity')) {
    failures.push('npm run verify must include deterministic build-output enforcement');
  }
} catch {
  failures.push('missing deterministic build-output integrity enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const publishSafety = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'publish-safety.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-publish-safety.mjs'));

  for (const invariant of [
    'must remain private=true',
    'version must remain 0.0.0 while pre-release',
    'must not declare publishConfig',
    'must not invoke npm publish/pack',
  ]) {
    if (!publishSafety.includes(invariant)) {
      failures.push(`publish-safety gate missing invariant: ${invariant}`);
    }
  }

  if (
    rootPackage.scripts?.['check:publish-safety'] !== 'node tools/project/check-publish-safety.mjs'
  ) {
    failures.push('root package must expose check:publish-safety');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:publish-safety')) {
    failures.push('npm run verify must include accidental-publish enforcement');
  }
} catch {
  failures.push('missing monorepo accidental-publish safety enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const workspaceResolution = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'workspace-resolution.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-workspace-resolution.mjs'));

  for (const invariant of [
    'internal workspace must resolve as link=true',
    'internal workspace resolved path mismatch',
    'internal dependency spec must be exact 0.0.0',
    'lockfile contains unknown internal package identity',
  ]) {
    if (!workspaceResolution.includes(invariant)) {
      failures.push(`workspace resolution gate missing invariant: ${invariant}`);
    }
  }
  if (
    rootPackage.scripts?.['check:workspace-resolution'] !==
    'node tools/project/check-workspace-resolution.mjs'
  ) {
    failures.push('root package must expose check:workspace-resolution');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:workspace-resolution')) {
    failures.push('npm run verify must include workspace resolution enforcement');
  }
} catch {
  failures.push('missing internal workspace dependency-confusion enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const entrypointGate = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'workspace-entrypoints.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-entrypoints.mjs'));

  for (const invariant of [
    'runtime entrypoint must resolve under dist/',
    'entrypoint escapes workspace boundary',
    'entrypoint target does not exist',
    'entrypoint target must be a file',
  ]) {
    if (!entrypointGate.includes(invariant)) {
      failures.push(`workspace entrypoint gate missing invariant: ${invariant}`);
    }
  }
  if (rootPackage.scripts?.['check:entrypoints'] !== 'node tools/project/check-entrypoints.mjs') {
    failures.push('root package must expose check:entrypoints');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:entrypoints')) {
    failures.push('npm run verify must include workspace entrypoint enforcement');
  }
} catch {
  failures.push('missing workspace package entrypoint integrity enforcement');
}

try {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const buildCompleteness = await fs.readFile(
    path.join(root, 'tools', 'project', 'lib', 'build-completeness.mjs'),
    'utf8',
  );
  await fs.access(path.join(root, 'tools', 'project', 'check-build-completeness.mjs'));

  for (const invariant of [
    'base tsconfig must keep declaration=true',
    'base tsconfig must keep sourceMap=true',
    'tsconfig rootDir must remain src',
    'tsconfig outDir must remain dist',
    'missing build artifact for',
  ]) {
    if (!buildCompleteness.includes(invariant)) {
      failures.push(`build completeness gate missing invariant: ${invariant}`);
    }
  }
  if (
    rootPackage.scripts?.['check:build-completeness'] !==
    'node tools/project/check-build-completeness.mjs'
  ) {
    failures.push('root package must expose check:build-completeness');
  }
  if (!rootPackage.scripts?.verify?.includes('npm run check:build-completeness')) {
    failures.push('npm run verify must include source-to-dist completeness enforcement');
  }
} catch {
  failures.push('missing source-to-dist build completeness enforcement');
}

try {
  const privacyLifecycle = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'privacy-lifecycle.ts'),
    'utf8',
  );

  for (const invariant of [
    'export function privacyManifestCanExportData(): false',
    'export function privacyManifestCanDeleteData(): false',
    'export function privacyManifestCanDeleteAuditData(): false',
    "readonly authority: 'NONE'",
    'readonly executionAuthorized: false',
    'readonly exportExecutionAuthorized: false',
    'readonly deletionAuthorized: false',
    'readonly auditDeletionAuthorized: false',
    "disposition: 'PROTECTED_AUDIT'",
    "decision.action === 'PURGE_CANDIDATE'",
    "createHash('sha256')",
  ]) {
    if (!privacyLifecycle.includes(invariant)) {
      failures.push(`privacy lifecycle manifest missing invariant: ${invariant}`);
    }
  }

  for (const forbidden of ['readonly payload:', 'readonly rawData:', 'readonly exportedData:']) {
    if (privacyLifecycle.includes(forbidden)) {
      failures.push(`privacy lifecycle manifest must remain metadata-only: ${forbidden}`);
    }
  }
} catch {
  failures.push('missing privacy export/delete manifest planning contract');
}

try {
  const egressPreparation = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'provider-egress-preparation.ts'),
    'utf8',
  );
  const dataPolicySource = await fs.readFile(
    path.join(root, 'packages', 'governance', 'src', 'data-policy.ts'),
    'utf8',
  );

  for (const invariant of [
    'export function providerEgressPreparationCanInvokeProvider(): false',
    'export function providerEgressPreparationCanGrantAuthority(): false',
    'readonly invocationAuthorized: false',
    "readonly authority: 'NONE'",
    'redactSensitive(originalPayload)',
    "createHash('sha256')",
    "outcome: 'DENY'",
    'packet: null',
  ]) {
    if (!egressPreparation.includes(invariant)) {
      failures.push(`provider egress preparation missing invariant: ${invariant}`);
    }
  }

  if (
    !dataPolicySource.includes(
      'unknown data classification fails closed at provider egress boundary',
    )
  ) {
    failures.push('provider egress policy must fail closed on unknown runtime classification');
  }
} catch {
  failures.push('missing fail-closed provider egress preparation contract');
}

try {
  const orchestrationDir = path.join(root, 'packages', 'orchestration', 'src');
  const orchestrationFiles = (await fs.readdir(orchestrationDir))
    .filter((name) => name.endsWith('.ts'))
    .sort();
  const forbiddenSideEffectMarkers = [
    "from 'node:fs'",
    "from 'node:fs/promises'",
    "from 'node:child_process'",
    "from 'node:http'",
    "from 'node:https'",
    "from 'node:net'",
    "from 'node:dgram'",
  ];

  for (const file of orchestrationFiles) {
    const source = await fs.readFile(path.join(orchestrationDir, file), 'utf8');
    for (const marker of forbiddenSideEffectMarkers) {
      if (source.includes(marker)) {
        failures.push(
          `pure orchestration module ${file} must not import side-effect API ${marker}`,
        );
      }
    }
  }

  const runtimeSource = await fs.readFile(
    path.join(root, 'apps', 'control-plane', 'src', 'execution-runtime.ts'),
    'utf8',
  );
  for (const invariant of [
    'export class ActivityRunner',
    "request.executionMode === 'REPLAY'",
    'readonly readOnly: true',
    "readonly authority: 'NONE'",
    'export function executionRuntimeCanGrantAuthority(): false',
    'export function activityRunnerCanExecuteDuringReplay(): false',
    'export function evaluateChangeBudget',
    'export function validateWorkspaceReattach',
  ]) {
    if (!runtimeSource.includes(invariant)) {
      failures.push(`execution runtime missing invariant: ${invariant}`);
    }
  }
} catch {
  failures.push('missing execution-runtime side-effect boundary contract');
}

try {
  const structuredResults = await fs.readFile(
    path.join(root, 'packages', 'contracts', 'src', 'runtime-results.ts'),
    'utf8',
  );

  for (const invariant of [
    "kind: z.literal('REVIEW')",
    "kind: z.literal('TEST_ADEQUACY')",
    "kind: z.literal('CANDIDATE_ADJUDICATION')",
    "kind: z.literal('AUTONOMOUS_MERGE_REVIEW')",
    "status: 'MALFORMED'",
    'export function structuredRoleResultIsSemanticNegative',
    'export function structuredRoleResultCanGrantAuthority(): false',
    'export function malformedOutputCanBecomeSemanticApproval(): false',
  ]) {
    if (!structuredResults.includes(invariant)) {
      failures.push(`structured specialist output contract missing invariant: ${invariant}`);
    }
  }
} catch {
  failures.push('missing structured specialist output contracts');
}

if (failures.length > 0) {
  console.error('Architecture check FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture check PASS');
