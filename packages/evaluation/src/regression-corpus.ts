export type RegressionSeverity = 'P0' | 'P1' | 'P2';
export type RegressionRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface RegressionMissFinding {
  readonly key: string;
  readonly severity: 'P0' | 'P1' | 'P2' | 'P3';
  readonly label: 'CONFIRMED' | 'FALSE_POSITIVE' | 'MISSED_BY_CANDIDATE' | 'UNRESOLVED';
}

export interface RegressionMissSource {
  readonly caseId: string;
  readonly role: string;
  readonly inputHash: string;
  readonly findings: readonly RegressionMissFinding[];
}

export interface RegressionCasePromotionInput {
  readonly caseId: string;
  readonly source: RegressionMissSource;
  readonly sourceFindingKey: string;
  readonly adjudicated: boolean;
  readonly riskTier: RegressionRiskTier;
  readonly sanitizedInputArtifactId: string;
  readonly sanitizedInputHash: string;
  readonly sanitizationAttestationHash: string;
  readonly evidenceHashes: readonly string[];
  readonly expectedFindingKey: string;
}

export interface RegressionCaseV1 {
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly role: string;
  readonly riskTier: RegressionRiskTier;
  readonly sourceCaseId: string;
  readonly sourceInputHash: string;
  readonly sourceFindingKeyHash: string;
  readonly severity: RegressionSeverity;
  readonly sanitizedInputArtifactId: string;
  readonly sanitizedInputHash: string;
  readonly sanitizationAttestationHash: string;
  readonly evidenceHashes: readonly string[];
  readonly expectedFindingKey: string;
  readonly expectedSeverity: RegressionSeverity;
  readonly hash: string;
  readonly authority: 'NONE';
}

export interface RegressionCorpusV1 {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly createdAt: string;
  readonly cases: readonly RegressionCaseV1[];
  readonly hash: string;
  readonly authority: 'NONE';
}

export interface RegressionWorkerFinding {
  readonly key: string;
  readonly severity: 'P0' | 'P1' | 'P2' | 'P3';
}

export interface RegressionWorker {
  readonly binding: {
    readonly id: string;
    readonly provider: string;
    readonly model: string;
  };
  invoke(input: string): Promise<{
    readonly findings: readonly RegressionWorkerFinding[];
    readonly malformed?: boolean;
  }>;
}

export interface RegressionCaseResultV1 {
  readonly caseId: string;
  readonly caseHash: string;
  readonly status: 'PASS' | 'FAIL' | 'INVALID_ARTIFACT' | 'EXECUTION_ERROR';
  readonly expectedFindingKey: string;
  readonly expectedSeverity: RegressionSeverity;
}

export interface RegressionRunReportV1 {
  readonly schemaVersion: 1;
  readonly corpusHash: string;
  readonly role: string;
  readonly bindingId: string;
  readonly provider: string;
  readonly model: string;
  readonly totalCases: number;
  readonly passedCases: number;
  readonly passed: boolean;
  readonly results: readonly RegressionCaseResultV1[];
  readonly hash: string;
  readonly authority: 'NONE';
}

export type SanitizedRegressionArtifactResolver = (artifactId: string) => Promise<string>;

export async function promoteConfirmedMissToRegressionCase(
  input: RegressionCasePromotionInput,
): Promise<RegressionCaseV1> {
  requireSafeId(input.caseId, 'caseId');
  requireSafeId(input.source.caseId, 'source caseId');
  requireSafeId(input.source.role, 'role');
  requireSafeId(input.sanitizedInputArtifactId, 'sanitizedInputArtifactId');
  requireSafeId(input.expectedFindingKey, 'expectedFindingKey');
  requireHash(input.source.inputHash, 'source inputHash');
  requireHash(input.sanitizedInputHash, 'sanitizedInputHash');
  requireHash(input.sanitizationAttestationHash, 'sanitizationAttestationHash');

  if (!input.adjudicated) {
    throw new Error('regression promotion requires adjudicated confirmation');
  }

  const matches = input.source.findings.filter((finding) => finding.key === input.sourceFindingKey);
  if (matches.length !== 1) {
    throw new Error('source finding key must identify exactly one finding');
  }
  const finding = matches[0];
  if (!finding || finding.label !== 'MISSED_BY_CANDIDATE') {
    throw new Error('regression promotion requires a candidate miss');
  }
  if (!isRegressionSeverity(finding.severity)) {
    throw new Error('regression promotion requires P0/P1/P2 severity');
  }

  const evidenceHashes = uniqueSortedHashes(input.evidenceHashes);
  if (evidenceHashes.length === 0) {
    throw new Error('regression case requires exact evidence hashes');
  }

  const sourceFindingKeyHash = await sha256Hex(input.sourceFindingKey);
  const identity = {
    schemaVersion: 1,
    caseId: input.caseId,
    role: input.source.role,
    riskTier: input.riskTier,
    sourceCaseId: input.source.caseId,
    sourceInputHash: input.source.inputHash,
    sourceFindingKeyHash,
    severity: finding.severity,
    sanitizedInputArtifactId: input.sanitizedInputArtifactId,
    sanitizedInputHash: input.sanitizedInputHash,
    sanitizationAttestationHash: input.sanitizationAttestationHash,
    evidenceHashes,
    expectedFindingKey: input.expectedFindingKey,
    expectedSeverity: finding.severity,
    authority: 'NONE' as const,
  };

  return {
    ...identity,
    hash: await sha256Hex(canonicalJson(identity)),
  };
}

export async function buildRegressionCorpus(input: {
  readonly version: string;
  readonly createdAt: string;
  readonly cases: readonly RegressionCaseV1[];
}): Promise<RegressionCorpusV1> {
  requireVersion(input.version);
  const createdAt = requireTimestamp(input.createdAt, 'createdAt');
  const seen = new Set<string>();
  const cases = [...input.cases].sort((left, right) => left.caseId.localeCompare(right.caseId));

  for (const regressionCase of cases) {
    await validateRegressionCase(regressionCase);
    if (seen.has(regressionCase.caseId)) {
      throw new Error(`duplicate regression case: ${regressionCase.caseId}`);
    }
    seen.add(regressionCase.caseId);
  }

  const identity = {
    schemaVersion: 1,
    version: input.version,
    createdAt,
    cases,
    authority: 'NONE' as const,
  };
  return {
    ...identity,
    hash: await sha256Hex(canonicalJson(identity)),
  };
}

export async function runRegressionCorpus(input: {
  readonly corpus: RegressionCorpusV1;
  readonly role: string;
  readonly worker: RegressionWorker;
  readonly resolveSanitizedInput: SanitizedRegressionArtifactResolver;
}): Promise<RegressionRunReportV1> {
  await validateRegressionCorpus(input.corpus);
  requireSafeId(input.role, 'role');
  requireSafeId(input.worker.binding.id, 'binding id');
  requireSafeId(input.worker.binding.provider, 'provider');
  requireSafeId(input.worker.binding.model, 'model');

  const matchingCases = input.corpus.cases.filter((item) => item.role === input.role);
  const results: RegressionCaseResultV1[] = [];

  for (const regressionCase of matchingCases) {
    let sanitizedInput: string;
    try {
      sanitizedInput = await input.resolveSanitizedInput(regressionCase.sanitizedInputArtifactId);
    } catch {
      results.push(caseResult(regressionCase, 'INVALID_ARTIFACT'));
      continue;
    }

    if ((await sha256Hex(sanitizedInput)) !== regressionCase.sanitizedInputHash) {
      results.push(caseResult(regressionCase, 'INVALID_ARTIFACT'));
      continue;
    }

    try {
      const opinion = await input.worker.invoke(sanitizedInput);
      const matched =
        opinion.malformed !== true &&
        opinion.findings.some(
          (finding) =>
            finding.key === regressionCase.expectedFindingKey &&
            finding.severity === regressionCase.expectedSeverity,
        );
      results.push(caseResult(regressionCase, matched ? 'PASS' : 'FAIL'));
    } catch {
      results.push(caseResult(regressionCase, 'EXECUTION_ERROR'));
    }
  }

  const passedCases = results.filter((item) => item.status === 'PASS').length;
  const identity = {
    schemaVersion: 1,
    corpusHash: input.corpus.hash,
    role: input.role,
    bindingId: input.worker.binding.id,
    provider: input.worker.binding.provider,
    model: input.worker.binding.model,
    totalCases: results.length,
    passedCases,
    passed: passedCases === results.length,
    results,
    authority: 'NONE' as const,
  };

  return {
    ...identity,
    hash: await sha256Hex(canonicalJson(identity)),
  };
}

export function regressionCorpusCanGrantAuthority(): false {
  return false;
}

export function regressionCorpusStoresRawSensitiveContent(): false {
  return false;
}

async function validateRegressionCorpus(corpus: RegressionCorpusV1): Promise<void> {
  if (corpus.schemaVersion !== 1) throw new Error('regression corpus schemaVersion must be 1');
  if (corpus.authority !== 'NONE') throw new Error('regression corpus authority must be NONE');
  requireVersion(corpus.version);
  requireTimestamp(corpus.createdAt, 'createdAt');
  for (const regressionCase of corpus.cases) await validateRegressionCase(regressionCase);
  const identity = {
    schemaVersion: 1,
    version: corpus.version,
    createdAt: corpus.createdAt,
    cases: corpus.cases,
    authority: 'NONE' as const,
  };
  if ((await sha256Hex(canonicalJson(identity))) !== corpus.hash) {
    throw new Error('regression corpus hash mismatch');
  }
}

async function validateRegressionCase(regressionCase: RegressionCaseV1): Promise<void> {
  if (regressionCase.schemaVersion !== 1) throw new Error('regression case schemaVersion must be 1');
  if (regressionCase.authority !== 'NONE') throw new Error('regression case authority must be NONE');
  requireSafeId(regressionCase.caseId, 'caseId');
  requireSafeId(regressionCase.role, 'role');
  requireSafeId(regressionCase.sourceCaseId, 'sourceCaseId');
  requireSafeId(regressionCase.sanitizedInputArtifactId, 'sanitizedInputArtifactId');
  requireSafeId(regressionCase.expectedFindingKey, 'expectedFindingKey');
  requireHash(regressionCase.sourceInputHash, 'sourceInputHash');
  requireHash(regressionCase.sourceFindingKeyHash, 'sourceFindingKeyHash');
  requireHash(regressionCase.sanitizedInputHash, 'sanitizedInputHash');
  requireHash(regressionCase.sanitizationAttestationHash, 'sanitizationAttestationHash');
  uniqueSortedHashes(regressionCase.evidenceHashes);
  if (!isRegressionSeverity(regressionCase.severity)) {
    throw new Error('regression case severity must be P0/P1/P2');
  }
  if (regressionCase.expectedSeverity !== regressionCase.severity) {
    throw new Error('regression case expected severity mismatch');
  }

  const { hash: _hash, ...identity } = regressionCase;
  if ((await sha256Hex(canonicalJson(identity))) !== regressionCase.hash) {
    throw new Error('regression case hash mismatch');
  }
}

function caseResult(
  regressionCase: RegressionCaseV1,
  status: RegressionCaseResultV1['status'],
): RegressionCaseResultV1 {
  return {
    caseId: regressionCase.caseId,
    caseHash: regressionCase.hash,
    status,
    expectedFindingKey: regressionCase.expectedFindingKey,
    expectedSeverity: regressionCase.expectedSeverity,
  };
}

function isRegressionSeverity(value: string): value is RegressionSeverity {
  return value === 'P0' || value === 'P1' || value === 'P2';
}

function uniqueSortedHashes(values: readonly string[]): string[] {
  const result = [...new Set(values)];
  for (const value of result) requireHash(value, 'evidence hash');
  return result.sort();
}

function requireHash(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
}

function requireSafeId(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:/-]{1,160}$/.test(normalized)) {
    throw new Error(`${field} must be a bounded machine-safe identifier`);
  }
  return normalized;
}

function requireVersion(value: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error('regression corpus version must be semantic x.y.z');
  }
  return value;
}

function requireTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value.trim() || Number.isNaN(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
