export const ACCEPTED_V2_REFERENCE = {
  repository: 'skonyd/creator-marketplace',
  pullRequest: 207,
  provisionalSha: '0e70f4a9680fcc5c287b7926f2aa20170c79f47d',
  mergeSha: 'e4707a3c4267db9d2aadd452782b91045b96724d',
  postMergeHardeningPullRequest: 209,
  sha: '1a8e215b78a3a5008aae6aae36488b3273733b19',
  referenceStatus: 'ACCEPTED',
  authority: 'ENABLED',
} as const;

export type RiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';
export type Effort = 'low' | 'medium' | 'high';

export const AUTHORITATIVE_ARTIFACT_KIND = 'full' as const;

export const V2_REFERENCE_TEST_REVIEW = {
  model: 'claude-opus-5-5',
  effort: 'low',
  maxRepairRounds: 2,
} as const;

export const V2_REFERENCE_FULL_VERIFICATION = [
  'npm run verify',
  'bash scripts/check-docs.sh',
  'bash automation/tests/run.sh',
] as const;

export const V2_REFERENCE_LOCAL_WORKER_GENERATION = {
  temperature: 1,
  topP: 0.95,
  topK: 20,
  minP: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  reasoningEffort: 'medium',
  enableThinking: true,
  preserveThinking: false,
  maxTokens: 16_384,
} as const;

export const V2_REFERENCE_LOCAL_WORKER_LIMITS = {
  gateTimeoutSeconds: 120,
  timeoutSeconds: 600,
  maxTotalSeconds: 900,
  retries: 2,
  retryDelaySeconds: 5,
  maxInputBytes: 2_000_000,
} as const;

export type V2ProviderFailureKind =
  | 'quota_exhausted'
  | 'rate_limited'
  | 'auth_unavailable'
  | 'provider_unavailable'
  | 'transport_failure'
  | 'semantic_failure'
  | 'malformed_output';

const v2AvailabilityFailures = new Set<V2ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

export function v2FallbackAllowed(kind: V2ProviderFailureKind): boolean {
  return v2AvailabilityFailures.has(kind);
}

export interface ModelRoute {
  readonly model: string;
  readonly effort: Effort;
}

export interface V2CompatibilityProfile {
  readonly controller: Readonly<Record<'normal' | 'high' | 'critical', ModelRoute>>;
  readonly finalReview: Readonly<Record<'normal' | 'high' | 'critical', ModelRoute>>;
  readonly criticalPaths: readonly string[];
  readonly highPaths: readonly string[];
  readonly denyPaths: readonly string[];
  readonly highSemanticLoc: number;
  readonly highPackageCount: number;
}

export const V2_REFERENCE_PROFILE: V2CompatibilityProfile = {
  controller: {
    normal: { model: 'sonnet', effort: 'low' },
    high: { model: 'sonnet', effort: 'medium' },
    critical: { model: 'sonnet', effort: 'medium' },
  },
  finalReview: {
    normal: { model: 'gpt-6-sol', effort: 'medium' },
    high: { model: 'gpt-6-sol', effort: 'medium' },
    critical: { model: 'gpt-6-sol', effort: 'medium' },
  },
  criticalPaths: [
    'packages/money/**',
    'packages/marketplace/src/agreements/**',
    'packages/*/src/schema/**',
    'packages/db/migrations/**',
    'packages/config/src/policy.ts',
    'docs/decisions/**',
    'docs/adr/**',
    'AGENTS.md',
    'CLAUDE.md',
    'REVIEW.md',
    '.github/workflows/**',
    '.githooks/**',
    'scripts/check-docs.sh',
    '.gitignore',
    '.gitattributes',
    'automation/**',
  ],
  highPaths: [
    'package-lock.json',
    'package.json',
    'packages/*/package.json',
    'apps/*/package.json',
    'packages/*/src/index.ts',
    'apps/*/app/api/**',
  ],
  highSemanticLoc: 300,
  highPackageCount: 3,
  denyPaths: [
    'packages/money/**',
    'packages/marketplace/src/agreements/**',
    'packages/*/src/schema/**',
    'packages/db/migrations/**',
    'packages/config/src/policy.ts',
    'docs/decisions/**',
    'docs/adr/**',
    'AGENTS.md',
    'CLAUDE.md',
    'REVIEW.md',
    '.github/workflows/**',
    '.githooks/**',
    'scripts/check-docs.sh',
    '.gitignore',
    '.gitattributes',
    'automation/**',
  ],
};

export function authorityPromotionAllowed(): true {
  return true;
}

export function assertAcceptedReference(): void {
  if (
    ACCEPTED_V2_REFERENCE.referenceStatus !== 'ACCEPTED' ||
    ACCEPTED_V2_REFERENCE.authority !== 'ENABLED'
  ) {
    throw new Error('FH-01B2 requires accepted V2 reference with compatibility authority enabled');
  }
}

export function newTaskId(): string {
  return globalThis.crypto.randomUUID();
}

export async function sha256Hex(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function taskFingerprint(repositoryIdentity: string, taskId: string): Promise<string> {
  return sha256Hex(`${repositoryIdentity}|${taskId}`);
}

async function hashBoundFields(fields: readonly string[]): Promise<string> {
  const fieldHashes = await Promise.all(fields.map((field) => sha256Hex(field)));
  return sha256Hex(fieldHashes.join(''));
}

export async function testReviewScopeHash(
  baseSha: string,
  title: string,
  body: string,
  triageHash: string,
): Promise<string> {
  return hashBoundFields([baseSha, title, body, triageHash]);
}

export async function finalReviewScopeHash(input: {
  readonly headSha: string;
  readonly baseSha: string;
  readonly title: string;
  readonly body: string;
  readonly labels: string;
  readonly taskId: string;
  readonly triageHash: string;
  readonly configHash: string;
  readonly effectiveRisk: RiskTier;
}): Promise<string> {
  return hashBoundFields([
    input.headSha,
    input.baseSha,
    input.title,
    input.body,
    input.labels,
    input.taskId,
    input.triageHash,
    input.configHash,
    input.effectiveRisk,
  ]);
}

export function parsePrTaskId(body: string): string | null {
  const matches = [...body.matchAll(/<!--\s*automation-task-id:\s*([A-Za-z0-9-]+)\s*-->/g)];
  return matches.length === 1 ? (matches[0]?.[1] ?? null) : null;
}

function globToRegex(glob: string): RegExp {
  const sentinel = '\u0000';
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, sentinel)
    .replace(/\*/g, '[^/]*')
    .replaceAll(sentinel, '.*');
  return new RegExp(`^${escaped}$`);
}

function pathMatches(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(path));
}

function affectedPackageCount(files: readonly string[]): number {
  const packages = new Set<string>();
  for (const file of files) {
    const match = /^(packages|apps)\/([^/]+)/.exec(file);
    if (match?.[1] && match[2]) packages.add(`${match[1]}/${match[2]}`);
  }
  return packages.size;
}

export interface RiskInput {
  readonly files: readonly string[];
  readonly semanticLoc: number;
  readonly sha: string;
}

export interface RiskResult {
  readonly status: 'PASS';
  readonly sha: string;
  readonly tier: RiskTier;
  readonly controller: string;
  readonly effort: Effort;
  readonly semanticLoc: number;
  readonly changedFiles: number;
  readonly affectedPackages: number;
  readonly reasons: readonly string[];
  readonly humanRequired: boolean;
}

export function classifyRisk(
  input: RiskInput,
  profile: V2CompatibilityProfile = V2_REFERENCE_PROFILE,
): RiskResult {
  if (input.files.length === 0) throw new Error('risk classification requires changed files');
  if (!Number.isInteger(input.semanticLoc) || input.semanticLoc < 0) {
    throw new Error('semanticLoc must be a non-negative integer');
  }

  const reasons: string[] = [];
  const critical = pathMatches(input.files.join('\n'), []);
  void critical;

  const hasCritical = input.files.some((file) =>
    pathMatches(file, [...profile.criticalPaths, ...profile.denyPaths]),
  );
  const packageCount = affectedPackageCount(input.files);
  let tier: RiskTier = 'NORMAL';

  if (hasCritical) {
    tier = 'CRITICAL';
    reasons.push('critical-or-deny-path');
  } else {
    if (input.files.some((file) => pathMatches(file, profile.highPaths))) {
      tier = 'HIGH';
      reasons.push('high-path');
    }
    if (input.semanticLoc > profile.highSemanticLoc) {
      tier = 'HIGH';
      reasons.push('semantic-loc');
    }
    if (packageCount > profile.highPackageCount) {
      tier = 'HIGH';
      reasons.push('package-count');
    }
  }

  const route = profile.controller[tier.toLowerCase() as 'normal' | 'high' | 'critical'];
  return {
    status: 'PASS',
    sha: input.sha,
    tier,
    controller: route.model,
    effort: route.effort,
    semanticLoc: input.semanticLoc,
    changedFiles: input.files.length,
    affectedPackages: packageCount,
    reasons,
    humanRequired: tier === 'CRITICAL',
  };
}

const riskRank: Readonly<Record<RiskTier, number>> = {
  NORMAL: 0,
  HIGH: 1,
  CRITICAL: 2,
};

export function maxRisk(initial: RiskTier, final: RiskTier): RiskTier {
  return riskRank[initial] >= riskRank[final] ? initial : final;
}

export interface FinalReviewRoute {
  readonly risk: RiskTier;
  readonly model: string;
  readonly effort: Effort;
  readonly humanRequired: boolean;
}

export function finalReviewRoute(
  tier: RiskTier,
  profile: V2CompatibilityProfile = V2_REFERENCE_PROFILE,
): FinalReviewRoute {
  const route = profile.finalReview[tier.toLowerCase() as 'normal' | 'high' | 'critical'];
  return {
    risk: tier,
    model: route.model,
    effort: route.effort,
    humanRequired: tier === 'CRITICAL',
  };
}

export function isTestPath(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(path) || /^automation\/tests\/[^/]+\.sh$/.test(path);
}

function isProductionLogicPath(path: string): boolean {
  if (isTestPath(path)) return false;
  if (
    path.includes('/generated/') ||
    path.includes('/migrations/meta/') ||
    path.includes('.snapshot.')
  ) {
    return false;
  }
  return /(^|\/)src\/.*\.(ts|tsx|js|jsx)$/.test(path);
}

export interface TestReviewRoutingInput {
  readonly tier: RiskTier;
  readonly reasons: readonly string[];
  readonly title: string;
  readonly labels: readonly string[];
  readonly files: readonly string[];
  readonly semanticLoc: number;
}

export function testReviewRequired(input: TestReviewRoutingInput): boolean {
  if (input.tier === 'HIGH' || input.tier === 'CRITICAL') return true;
  if (
    input.reasons.some((reason) => reason === 'critical-or-deny-path' || reason === 'high-path')
  ) {
    return true;
  }
  if (input.labels.some((label) => /^(bug|regression)$/i.test(label.trim()))) return true;
  if (/^(fix(\([^)]*\))?!?:|hotfix:|regression:)/.test(input.title)) return true;
  if (input.semanticLoc <= 0) return false;

  const testsChanged = input.files.some(isTestPath);
  const productionLogicChanged = input.files.some(isProductionLogicPath);
  return testsChanged && productionLogicChanged;
}

export type ArtifactType =
  | 'pre-review'
  | 'candidate-adjudication'
  | 'context-triage'
  | 'context-triage-adjudication'
  | 'failure-analysis'
  | 'deep-analysis'
  | 'test-review'
  | 'verify-full'
  | 'verify-fast'
  | 'final-review';

const roles = new Set([
  'context',
  'context-triage',
  'triage',
  'failure-analysis',
  'deep-analysis',
  'implement',
  'pre-review',
  'test-review',
  'evaluator',
]);

const allowedRoleStatus = new Set([
  'context:PASS',
  'context:WARN',
  'triage:PASS',
  'triage:WARN',
  'triage:CANDIDATE',
  'implement:PASS',
  'implement:FAIL',
  'pre-review:CANDIDATE',
  'evaluator:PASS',
  'evaluator:FAIL',
  'evaluator:WARN',
  'context-triage:PASS',
  'context-triage:WARN',
  'failure-analysis:PASS',
  'failure-analysis:WARN',
  'deep-analysis:PASS',
  'deep-analysis:WARN',
  'test-review:COMPLETE',
]);

function topValues(text: string, key: string): string[] {
  return [...text.matchAll(new RegExp(`^${key}: (.*)$`, 'gm'))].map((match) => match[1] ?? '');
}

function topValue(text: string, key: string): string | null {
  const values = topValues(text, key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

function lastTopValue(text: string, key: string): string | null {
  const values = topValues(text, key);
  return values.length > 0 ? (values.at(-1) ?? null) : null;
}

function hasTopHeader(text: string, key: string): boolean {
  return new RegExp(`^${key}:`, 'm').test(text);
}

function section(text: string, key: string): string {
  const match = new RegExp(`(?:^|\\n)${key}:\\n([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`).exec(text);
  return match?.[1]?.trimEnd() ?? '';
}

export function contextTriageHasSignal(text: string): boolean {
  for (const key of ['AMBIGUITIES', 'RISKS_CANDIDATE']) {
    const lines = section(text.replaceAll('\r', ''), key)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.some((line) => !/^-\s*none\s*$/i.test(line))) return true;
  }
  return false;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function result(errors: string[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

export function validateProtocol(text: string, expectedSha?: string): ValidationResult {
  const errors: string[] = [];
  const statuses = topValues(text, 'STATUS');
  const rolesFound = topValues(text, 'ROLE');
  const status = statuses[0] ?? null;
  const role = rolesFound[0] ?? null;
  const sha = topValues(text, 'SHA')[0] ?? null;

  if (statuses.length !== 1) errors.push('STATUS must appear exactly once');
  if (rolesFound.length !== 1) errors.push('ROLE must appear exactly once');
  if (!status || !['PASS', 'WARN', 'FAIL', 'CANDIDATE', 'COMPLETE'].includes(status)) {
    errors.push('invalid STATUS');
  }
  if (!role || !roles.has(role)) errors.push('invalid ROLE');
  if (!sha) errors.push('missing SHA');
  if (expectedSha && sha !== expectedSha) errors.push('SHA mismatch');

  if (role === 'context-triage') {
    for (const field of ['TASK_SUMMARY', 'RELEVANT_FILES', 'AMBIGUITIES', 'RISKS_CANDIDATE']) {
      if (!hasTopHeader(text, field)) errors.push(`missing ${field}`);
    }
  } else if (role === 'failure-analysis') {
    for (const field of [
      'ROOT_CAUSE_CANDIDATES',
      'RELEVANT_LOG_LINES',
      'LIKELY_FILES',
      'FIX_CANDIDATES',
    ]) {
      if (!hasTopHeader(text, field)) errors.push(`missing ${field}`);
    }
  } else if (role === 'deep-analysis') {
    for (const field of ['DIRECT_IMPACT', 'TRANSITIVE_IMPACT', 'CROSS_CONTEXT_IMPACT']) {
      if (!hasTopHeader(text, field)) errors.push(`missing ${field}`);
    }
  } else if (role === 'test-review') {
    for (const field of ['TEST_COVERAGE', 'ORACLE_QUALITY', 'TEST_SUFFICIENCY', 'FINDINGS']) {
      if (!hasTopHeader(text, field)) errors.push(`missing ${field}`);
    }
  } else {
    for (const field of ['SCOPE', 'SUMMARY', 'FINDINGS', 'TESTS', 'RESIDUAL_RISK', 'NEXT_ACTION']) {
      if (!hasTopHeader(text, field)) errors.push(`missing ${field}`);
    }
  }

  if (role && status && !allowedRoleStatus.has(`${role}:${status}`)) {
    errors.push('role/status combination is not allowed');
  }

  return result(errors);
}

export function validateTestReview(text: string, expectedSha?: string): ValidationResult {
  const errors = [...validateProtocol(text, expectedSha).errors];

  for (const field of ['TEST_COVERAGE', 'ORACLE_QUALITY', 'TEST_SUFFICIENCY', 'FINDINGS']) {
    if ([...text.matchAll(new RegExp(`^${field}:`, 'gm'))].length !== 1) {
      errors.push(`${field} must appear exactly once`);
    }
  }

  const oracle = topValue(text, 'ORACLE_QUALITY');
  if (!oracle || !['STRONG', 'ADEQUATE', 'WEAK'].includes(oracle)) {
    errors.push('invalid ORACLE_QUALITY');
  }

  const sufficiency = topValue(text, 'TEST_SUFFICIENCY');
  if (!sufficiency || !['SUFFICIENT', 'INSUFFICIENT'].includes(sufficiency)) {
    errors.push('invalid TEST_SUFFICIENCY');
  }

  const coverage = section(text, 'TEST_COVERAGE');
  for (const field of [
    'acceptance_criteria',
    'positive_path',
    'negative_path',
    'boundaries',
    'regression',
  ]) {
    const matches = [...coverage.matchAll(new RegExp(`^  ${field}: (.*)$`, 'gm'))];
    if (matches.length !== 1 || !['YES', 'NO'].includes(matches[0]?.[1] ?? '')) {
      errors.push(`invalid TEST_COVERAGE.${field}`);
    }
  }

  const findings = section(text, 'FINDINGS').trimEnd();
  const nonBlankLines = findings.split('\n').filter((line) => line.trim());
  const isNone = nonBlankLines.length === 1 && /^\s*-\s*none\s*$/.test(nonBlankLines[0] ?? '');

  if (sufficiency === 'INSUFFICIENT' && (!findings.trim() || isNone)) {
    errors.push('INSUFFICIENT requires a finding');
  }

  if (findings.trim() && !isNone) {
    const blocks = findings.split(/(?=^\s*-\s*ID:)/m).filter((block) => block.trim());
    if (blocks.length === 0) errors.push('malformed FINDINGS');
    for (const block of blocks) {
      for (const field of [
        'SEVERITY',
        'REQUIREMENT',
        'TEST_FILE',
        'ISSUE',
        'WHY_CURRENT_TEST_CAN_MISS_BUG',
        'REQUIRED_EVIDENCE',
      ]) {
        if (!new RegExp(`^\\s*${field}:`, 'm').test(block)) {
          errors.push(`finding missing ${field}`);
        }
      }
      const severity = /^\s*SEVERITY:\s*(\S+)/m.exec(block)?.[1];
      if (!severity || !['P0', 'P1', 'P2'].includes(severity)) {
        errors.push('finding has invalid SEVERITY');
      }
    }
  }

  return result(errors);
}

function contractAllowed(type: ArtifactType, text: string): boolean {
  const role = topValues(text, 'ROLE')[0] ?? '';
  const status = topValues(text, 'STATUS')[0] ?? '';
  const key = `${type}:${role}:${status}`;
  const allowed = new Set([
    'pre-review:pre-review:CANDIDATE',
    'candidate-adjudication:evaluator:PASS',
    'context-triage:context-triage:PASS',
    'context-triage:context-triage:WARN',
    'context-triage-adjudication:evaluator:PASS',
    'failure-analysis:failure-analysis:PASS',
    'failure-analysis:failure-analysis:WARN',
    'deep-analysis:deep-analysis:PASS',
    'deep-analysis:deep-analysis:WARN',
    'verify-full:evaluator:PASS',
    'verify-full:evaluator:FAIL',
    'verify-fast:evaluator:PASS',
    'verify-fast:evaluator:FAIL',
    'final-review:evaluator:PASS',
    'final-review:evaluator:FAIL',
  ]);

  if (type === 'test-review') {
    return role === 'test-review' && status === 'COMPLETE' && validateTestReview(text).valid;
  }
  return allowed.has(key);
}

const producerByType: Readonly<Partial<Record<ArtifactType, string>>> = {
  'pre-review': 'local-worker-pre-review',
  'candidate-adjudication': 'sonnet-candidate-adjudication',
  'context-triage': 'local-worker-context-triage',
  'context-triage-adjudication': 'sonnet-context-triage-adjudication',
  'failure-analysis': 'local-worker-failure-analysis',
  'deep-analysis': 'local-worker-deep-analysis',
  'test-review': 'opus-test-review',
  'verify-full': 'automation/verify.sh',
  'verify-fast': 'automation/verify.sh',
  'final-review': 'gpt-6-sol-final-review',
};

export interface ArtifactValidationOptions {
  readonly expectedSha: string;
  readonly configHash: string;
  readonly trustedStore?: boolean;
  readonly profile?: V2CompatibilityProfile;
  readonly expectedTestReviewScopeHash?: string;
  readonly expectedFinalReviewScopeHash?: string;
}

export function validateArtifactForStore(
  type: ArtifactType,
  text: string,
  options: ArtifactValidationOptions,
): ValidationResult {
  const errors = [...validateProtocol(text, options.expectedSha).errors];
  if (!contractAllowed(type, text)) errors.push('artifact contract mismatch');

  if (
    (type === 'candidate-adjudication' || type === 'context-triage-adjudication') &&
    options.trustedStore !== true
  ) {
    errors.push('trusted store required');
  }

  const expectedProducer = producerByType[type];
  if (expectedProducer && lastTopValue(text, 'PRODUCER') !== expectedProducer) {
    errors.push('producer provenance mismatch');
  }
  if (lastTopValue(text, 'CONFIG_HASH') !== options.configHash) {
    errors.push('config provenance mismatch');
  }

  if (type === 'candidate-adjudication') {
    const values = topValues(text, 'PRE_REVIEW_CONTENT_HASH');
    if (values.length !== 1 || !/^[0-9a-f]{64}$/.test(values[0] ?? '')) {
      errors.push('invalid PRE_REVIEW_CONTENT_HASH');
    }
  }

  if (type === 'test-review') {
    const scopeHashes = topValues(text, 'SCOPE_HASH');
    if (scopeHashes.length !== 1 || !/^[0-9a-f]{64}$/.test(scopeHashes[0] ?? '')) {
      errors.push('invalid test-review SCOPE_HASH');
    } else if (
      options.expectedTestReviewScopeHash !== undefined &&
      scopeHashes[0] !== options.expectedTestReviewScopeHash
    ) {
      errors.push('test-review SCOPE_HASH mismatch');
    }
  }

  if (type === 'final-review') {
    const initial = topValue(text, 'INITIAL_RISK') as RiskTier | null;
    const final = topValue(text, 'FINAL_RISK') as RiskTier | null;
    const effective = topValue(text, 'EFFECTIVE_RISK') as RiskTier | null;
    const model = topValue(text, 'MODEL');
    const effort = topValue(text, 'EFFORT');
    const scopeHashes = topValues(text, 'SCOPE_HASH');
    const profile = options.profile ?? V2_REFERENCE_PROFILE;

    if (scopeHashes.length !== 1 || !/^[0-9a-f]{64}$/.test(scopeHashes[0] ?? '')) {
      errors.push('invalid final-review SCOPE_HASH');
    } else if (
      options.expectedFinalReviewScopeHash !== undefined &&
      scopeHashes[0] !== options.expectedFinalReviewScopeHash
    ) {
      errors.push('final-review SCOPE_HASH mismatch');
    }

    if (!initial || !final || !effective || !(initial in riskRank) || !(final in riskRank)) {
      errors.push('invalid final-review risk provenance');
    } else {
      if (effective !== maxRisk(initial, final)) errors.push('EFFECTIVE_RISK mismatch');
      const configured = finalReviewRoute(effective, profile);
      if (model !== 'gpt-6-sol' || configured.model !== model) {
        errors.push('final reviewer model mismatch');
      }
      if (effort !== 'medium') {
        errors.push('final-review effort must be medium');
      }
    }
  }

  return result(errors);
}

function containsReservedLine(text: string, fields: readonly string[]): boolean {
  return fields.some((field) => new RegExp(`^${field}:`, 'm').test(text));
}

export async function stampCandidateAdjudication(
  controllerArtifact: string,
  revision: string,
  configHash: string,
  preReviewFull: string,
): Promise<string> {
  if (
    containsReservedLine(controllerArtifact, ['PRODUCER', 'CONFIG_HASH', 'PRE_REVIEW_CONTENT_HASH'])
  ) {
    throw new Error('candidate adjudication contains reserved provenance');
  }

  const preReviewContentHash = await sha256Hex(preReviewFull);
  return `${controllerArtifact.trimEnd()}\n\nPRODUCER: sonnet-candidate-adjudication\nCONFIG_HASH: ${configHash}\nPRE_REVIEW_CONTENT_HASH: ${preReviewContentHash}\n`;
}

export async function stampContextTriageAdjudication(
  controllerArtifact: string,
  configHash: string,
  triageFull: string,
): Promise<string> {
  if (containsReservedLine(controllerArtifact, ['PRODUCER', 'TRIAGE_CONTENT_HASH'])) {
    throw new Error('context-triage adjudication contains reserved provenance');
  }

  const triageContentHash = await sha256Hex(triageFull);
  return `${controllerArtifact.trimEnd()}\n\nPRODUCER: sonnet-context-triage-adjudication\nCONFIG_HASH: ${configHash}\nTRIAGE_CONTENT_HASH: ${triageContentHash}\n`;
}

export function candidateIds(preReview: string): readonly string[] {
  const findings = section(preReview, 'FINDINGS');
  const ids = [...findings.matchAll(/^\s*-?\s*ID:\s*(.+)$/gm)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);
  return [...new Set(ids)].sort();
}

export interface CandidateDecision {
  readonly id: string;
  readonly decision: 'ACCEPTED' | 'REJECTED' | 'FIXED';
  readonly reason: string;
  readonly evidence: string;
}

export function candidateDecisions(adjudication: string): readonly CandidateDecision[] {
  const decisions: CandidateDecision[] = [];
  for (const match of adjudication.matchAll(/^CANDIDATE_DECISION: (.*)$/gm)) {
    const raw = match[1] ?? '';
    const fields = raw.split('|');
    if (
      fields.length !== 4 ||
      !fields[0] ||
      !['ACCEPTED', 'REJECTED', 'FIXED'].includes(fields[1] ?? '') ||
      !fields[2] ||
      !fields[3]
    ) {
      throw new Error('malformed CANDIDATE_DECISION');
    }
    decisions.push({
      id: fields[0],
      decision: fields[1] as CandidateDecision['decision'],
      reason: fields[2],
      evidence: fields[3],
    });
  }
  return decisions;
}

export async function validateCandidateAdjudication(input: {
  readonly preReview: string;
  readonly preReviewFull: string;
  readonly adjudication: string;
  readonly revision: string;
  readonly configHash: string;
}): Promise<ValidationResult> {
  const errors = [
    ...validateArtifactForStore('candidate-adjudication', input.adjudication, {
      expectedSha: input.revision,
      configHash: input.configHash,
      trustedStore: true,
    }).errors,
  ];

  const expectedHash = await sha256Hex(input.preReviewFull);
  if (topValue(input.adjudication, 'PRE_REVIEW_CONTENT_HASH') !== expectedHash) {
    errors.push('candidate adjudication is not bound to current pre-review content');
  }

  const expectedIds = candidateIds(input.preReview);
  if (expectedIds.length === 0) errors.push('pre-review has no candidate IDs');

  try {
    const decisions = candidateDecisions(input.adjudication);
    const actualIds = decisions.map((decision) => decision.id).sort();
    if (new Set(actualIds).size !== actualIds.length) {
      errors.push('duplicate candidate decision');
    }
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      errors.push('candidate decision set does not exactly match pre-review candidates');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'candidate decision parse failed');
  }

  return result(errors);
}

export async function validateContextTriageGate(input: {
  readonly triage: string;
  readonly taskFingerprint: string;
  readonly baseSha: string;
  readonly configHash: string;
  readonly adjudication?: string;
}): Promise<ValidationResult> {
  const errors = [
    ...validateArtifactForStore('context-triage', input.triage, {
      expectedSha: input.taskFingerprint,
      configHash: input.configHash,
    }).errors,
  ];

  if (topValue(input.triage, 'BASE_SHA') !== input.baseSha) {
    errors.push('context-triage BASE_SHA mismatch');
  }

  const status = topValue(input.triage, 'STATUS');
  const needsAdjudication = status === 'WARN' || contextTriageHasSignal(input.triage);
  if (needsAdjudication) {
    if (!input.adjudication) {
      errors.push('context-triage signal requires adjudication');
    } else {
      errors.push(
        ...validateArtifactForStore('context-triage-adjudication', input.adjudication, {
          expectedSha: input.taskFingerprint,
          configHash: input.configHash,
          trustedStore: true,
        }).errors,
      );
      const expectedHash = await sha256Hex(input.triage);
      if (topValue(input.adjudication, 'TRIAGE_CONTENT_HASH') !== expectedHash) {
        errors.push('triage adjudication is not bound to current triage content');
      }
    }
  }

  return result(errors);
}

export type TestSufficiency = 'SUFFICIENT' | 'INSUFFICIENT';

export interface RepairState {
  readonly lastReviewedSha: string | null;
  readonly lastOutcome: TestSufficiency | null;
  readonly repairRounds: number;
}

export interface TestReviewPlan {
  readonly reuseArtifact: boolean;
  readonly callRequired: boolean;
  readonly pendingRepair: boolean;
  readonly blockedByRoundLimit: boolean;
}

export function planTestReviewAttempt(input: {
  readonly currentSha: string;
  readonly validArtifactExists: boolean;
  readonly state: RepairState;
  readonly maxRepairRounds: number;
}): TestReviewPlan {
  if (input.validArtifactExists) {
    return {
      reuseArtifact: true,
      callRequired: false,
      pendingRepair: false,
      blockedByRoundLimit: false,
    };
  }

  const pendingRepair =
    input.state.lastOutcome === 'INSUFFICIENT' && input.state.lastReviewedSha !== input.currentSha;

  return {
    reuseArtifact: false,
    callRequired: true,
    pendingRepair,
    blockedByRoundLimit: pendingRepair && input.state.repairRounds >= input.maxRepairRounds,
  };
}

export function recordSuccessfulTestReview(input: {
  readonly currentSha: string;
  readonly outcome: TestSufficiency;
  readonly pendingRepair: boolean;
  readonly previousState: RepairState;
}): RepairState {
  return {
    lastReviewedSha: input.currentSha,
    lastOutcome: input.outcome,
    repairRounds: input.previousState.repairRounds + (input.pendingRepair ? 1 : 0),
  };
}
