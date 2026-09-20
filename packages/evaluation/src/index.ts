export {
  buildShadowParityReport,
  parityCanCutOverV3,
  parityCanGrantAuthority,
  type ParityBinding,
  type ParityDimension,
  type ParityDimensionResult,
  type ParityDimensionStatus,
  type ParityObservation,
  type ShadowParityCase,
  type ShadowParityReport,
  type ShadowParityStatus,
  type V2ReferenceStatus,
} from './parity.js';

export type ShadowRoleId =
  | 'repo-analysis'
  | 'test-candidate-reviewer'
  | 'security-candidate-reviewer'
  | 'architecture-consistency-reviewer'
  | 'cve-dependency-triage';

export const SHADOW_ROLES: readonly ShadowRoleId[] = [
  'repo-analysis',
  'test-candidate-reviewer',
  'security-candidate-reviewer',
  'architecture-consistency-reviewer',
  'cve-dependency-triage',
] as const;

export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export interface ShadowFinding {
  readonly key: string;
  readonly severity: FindingSeverity;
  readonly summary: string;
  readonly evidence?: readonly string[];
}

export interface ShadowOpinion {
  readonly findings: readonly ShadowFinding[];
  readonly malformed?: boolean;
  readonly evidenceQuality?: 'STRONG' | 'ADEQUATE' | 'WEAK';
}

export interface ShadowBinding {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly independenceKey: string;
}

export interface ShadowWorker {
  readonly binding: ShadowBinding;
  invoke(input: string): Promise<ShadowOpinion>;
}

export interface ShadowSideResult {
  readonly binding: ShadowBinding;
  readonly inputHash: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly latencyMs: number;
  readonly status: 'FULFILLED' | 'REJECTED';
  readonly opinion?: ShadowOpinion;
  readonly error?: string;
}

export interface ShadowPairResult {
  readonly caseId: string;
  readonly role: ShadowRoleId;
  readonly inputHash: string;
  readonly authority: 'NONE';
  readonly candidate: ShadowSideResult;
  readonly reference: ShadowSideResult;
}

export type ReconciliationLabel =
  'CONFIRMED' | 'FALSE_POSITIVE' | 'MISSED_BY_CANDIDATE' | 'UNRESOLVED';

export interface FindingReconciliation {
  readonly key: string;
  readonly severity: FindingSeverity;
  readonly label: ReconciliationLabel;
}

export interface ShadowReconciliation {
  readonly caseId: string;
  readonly role: ShadowRoleId;
  readonly inputHash: string;
  readonly agreement: boolean;
  readonly malformedCandidate: boolean;
  readonly malformedReference: boolean;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly p0p1Miss: number;
  readonly p2Miss: number;
  readonly findings: readonly FindingReconciliation[];
  readonly promotionAuthority: 'NONE';
}

export function shadowCanGrantAuthority(): false {
  return false;
}

export async function runIndependentShadowPair(input: {
  readonly caseId: string;
  readonly role: ShadowRoleId;
  readonly authoritativeInput: string;
  readonly candidate: ShadowWorker;
  readonly reference: ShadowWorker;
  readonly now?: () => number;
}): Promise<ShadowPairResult> {
  if (!input.caseId.trim()) throw new Error('caseId is required');
  if (!input.authoritativeInput) throw new Error('authoritativeInput is required');
  if (input.candidate.binding.independenceKey === input.reference.binding.independenceKey) {
    throw new Error('candidate and reference must use different independence keys');
  }

  const inputHash = await sha256Hex(input.authoritativeInput);
  const now = input.now ?? (() => Date.now());

  const candidateStarted = now();
  const candidatePromise = settleWorker(
    input.candidate,
    input.authoritativeInput,
    inputHash,
    candidateStarted,
    now,
  );
  const referenceStarted = now();
  const referencePromise = settleWorker(
    input.reference,
    input.authoritativeInput,
    inputHash,
    referenceStarted,
    now,
  );
  const [candidate, reference] = await Promise.all([candidatePromise, referencePromise]);

  return {
    caseId: input.caseId,
    role: input.role,
    inputHash,
    authority: 'NONE',
    candidate,
    reference,
  };
}

export function reconcileShadowPair(pair: ShadowPairResult): ShadowReconciliation {
  if (pair.authority !== 'NONE') throw new Error('shadow pair must remain non-authoritative');
  if (pair.candidate.inputHash !== pair.inputHash || pair.reference.inputHash !== pair.inputHash) {
    throw new Error('shadow opinions must bind to the same authoritative input hash');
  }
  if (pair.candidate.binding.independenceKey === pair.reference.binding.independenceKey) {
    throw new Error('shadow opinions are not independent');
  }

  const candidateFindings = validFindingMap(pair.candidate.opinion);
  const referenceFindings = validFindingMap(pair.reference.opinion);
  const findings: FindingReconciliation[] = [];

  for (const [key, referenceFinding] of referenceFindings) {
    if (candidateFindings.has(key)) {
      findings.push({
        key,
        severity: referenceFinding.severity,
        label: 'CONFIRMED',
      });
    } else {
      findings.push({
        key,
        severity: referenceFinding.severity,
        label: 'MISSED_BY_CANDIDATE',
      });
    }
  }

  for (const [key, candidateFinding] of candidateFindings) {
    if (!referenceFindings.has(key)) {
      findings.push({
        key,
        severity: candidateFinding.severity,
        label: 'FALSE_POSITIVE',
      });
    }
  }

  if (pair.candidate.status !== 'FULFILLED' || pair.reference.status !== 'FULFILLED') {
    findings.push({
      key: 'shadow-execution',
      severity: 'P2',
      label: 'UNRESOLVED',
    });
  }

  const labels = findings.map((finding) => finding.label);
  const p0p1Miss = findings.filter(
    (finding) =>
      finding.label === 'MISSED_BY_CANDIDATE' &&
      (finding.severity === 'P0' || finding.severity === 'P1'),
  ).length;
  const p2Miss = findings.filter(
    (finding) => finding.label === 'MISSED_BY_CANDIDATE' && finding.severity === 'P2',
  ).length;

  return {
    caseId: pair.caseId,
    role: pair.role,
    inputHash: pair.inputHash,
    agreement:
      pair.candidate.status === 'FULFILLED' &&
      pair.reference.status === 'FULFILLED' &&
      labels.every((label) => label === 'CONFIRMED'),
    malformedCandidate: pair.candidate.opinion?.malformed === true,
    malformedReference: pair.reference.opinion?.malformed === true,
    confirmed: labels.filter((label) => label === 'CONFIRMED').length,
    falsePositive: labels.filter((label) => label === 'FALSE_POSITIVE').length,
    p0p1Miss,
    p2Miss,
    findings,
    promotionAuthority: 'NONE',
  };
}

async function settleWorker(
  worker: ShadowWorker,
  authoritativeInput: string,
  inputHash: string,
  startedAtMs: number,
  now: () => number,
): Promise<ShadowSideResult> {
  try {
    const opinion = await worker.invoke(authoritativeInput);
    const completedAtMs = now();
    return {
      binding: worker.binding,
      inputHash,
      startedAtMs,
      completedAtMs,
      latencyMs: Math.max(0, completedAtMs - startedAtMs),
      status: 'FULFILLED',
      opinion,
    };
  } catch (error) {
    const completedAtMs = now();
    return {
      binding: worker.binding,
      inputHash,
      startedAtMs,
      completedAtMs,
      latencyMs: Math.max(0, completedAtMs - startedAtMs),
      status: 'REJECTED',
      error: error instanceof Error ? error.message : 'unknown shadow worker failure',
    };
  }
}

function validFindingMap(opinion: ShadowOpinion | undefined): Map<string, ShadowFinding> {
  const map = new Map<string, ShadowFinding>();
  for (const finding of opinion?.findings ?? []) {
    if (!finding.key.trim()) throw new Error('finding key is required');
    if (map.has(finding.key)) throw new Error(`duplicate finding key: ${finding.key}`);
    map.set(finding.key, finding);
  }
  return map;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type BenchmarkRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface ShadowBenchmarkSample {
  readonly sampleId: string;
  readonly role: ShadowRoleId;
  readonly riskTier: BenchmarkRiskTier;
  readonly adjudicated: boolean;
  readonly synthetic: boolean;
  readonly reconciliation: ShadowReconciliation;
  readonly candidateLatencyMs?: number;
  readonly referenceLatencyMs?: number;
  readonly candidateTotalTokens?: number;
  readonly referenceTotalTokens?: number;
  readonly candidateCostUsd?: number;
  readonly referenceCostUsd?: number;
}

export interface BenchmarkReport {
  readonly role: ShadowRoleId;
  readonly riskTier: BenchmarkRiskTier;
  readonly totalSamples: number;
  readonly eligibleSamples: number;
  readonly excludedSamples: number;
  readonly agreementRate: number | null;
  readonly precision: number | null;
  readonly confirmedFindings: number;
  readonly falsePositives: number;
  readonly missedFindings: number;
  readonly p0p1Misses: number;
  readonly p2Misses: number;
  readonly malformedCandidateSamples: number;
  readonly candidateLatencyP50Ms: number | null;
  readonly candidateLatencyP95Ms: number | null;
  readonly referenceLatencyP50Ms: number | null;
  readonly referenceLatencyP95Ms: number | null;
  readonly candidateTotalTokens: number;
  readonly referenceTotalTokens: number;
  readonly candidateCostUsd: number;
  readonly referenceCostUsd: number;
  readonly projectedCostSavingRatio: number | null;
}

export type PromotionScreeningStatus =
  'INSUFFICIENT_DATA' | 'BLOCKED' | 'PROMOTION_CANDIDATE' | 'HUMAN_POLICY_REQUIRED';

export interface PromotionScreening {
  readonly status: PromotionScreeningStatus;
  readonly reasons: readonly string[];
  readonly authorityGranted: false;
}

export interface PromotionScreeningOptions {
  readonly regressionSuitePassed?: boolean;
  readonly minimumNormalCostSavingRatio?: number;
}

export const PROVISIONAL_PROMOTION_FLOORS = {
  NORMAL: {
    minimumSamples: 50,
    minimumAgreementRate: 0.95,
    minimumCostSavingRatio: 0.1,
  },
  HIGH: {
    minimumSamples: 100,
    minimumAgreementRate: 0.97,
  },
} as const;

export function promotionCanApplyAutomatically(): false {
  return false;
}

export function buildBenchmarkReport(
  samples: readonly ShadowBenchmarkSample[],
  role: ShadowRoleId,
  riskTier: BenchmarkRiskTier,
): BenchmarkReport {
  const matching = samples.filter((sample) => sample.role === role && sample.riskTier === riskTier);
  const eligible = matching.filter((sample) => sample.adjudicated && !sample.synthetic);

  let confirmedFindings = 0;
  let falsePositives = 0;
  let missedFindings = 0;
  let p0p1Misses = 0;
  let p2Misses = 0;
  let malformedCandidateSamples = 0;
  let agreements = 0;

  const candidateLatencies: number[] = [];
  const referenceLatencies: number[] = [];
  let candidateTotalTokens = 0;
  let referenceTotalTokens = 0;
  let candidateCostUsd = 0;
  let referenceCostUsd = 0;

  for (const sample of eligible) {
    const reconciliation = sample.reconciliation;
    if (reconciliation.role !== role) {
      throw new Error(`sample ${sample.sampleId} role does not match reconciliation role`);
    }
    if (reconciliation.agreement) agreements += 1;
    if (reconciliation.malformedCandidate) malformedCandidateSamples += 1;

    confirmedFindings += reconciliation.confirmed;
    falsePositives += reconciliation.falsePositive;
    p0p1Misses += reconciliation.p0p1Miss;
    p2Misses += reconciliation.p2Miss;
    missedFindings += reconciliation.findings.filter(
      (finding) => finding.label === 'MISSED_BY_CANDIDATE',
    ).length;

    pushFinite(candidateLatencies, sample.candidateLatencyMs);
    pushFinite(referenceLatencies, sample.referenceLatencyMs);
    candidateTotalTokens += finiteOrZero(sample.candidateTotalTokens);
    referenceTotalTokens += finiteOrZero(sample.referenceTotalTokens);
    candidateCostUsd += finiteOrZero(sample.candidateCostUsd);
    referenceCostUsd += finiteOrZero(sample.referenceCostUsd);
  }

  const precisionDenominator = confirmedFindings + falsePositives;
  return {
    role,
    riskTier,
    totalSamples: matching.length,
    eligibleSamples: eligible.length,
    excludedSamples: matching.length - eligible.length,
    agreementRate: eligible.length > 0 ? agreements / eligible.length : null,
    precision: precisionDenominator > 0 ? confirmedFindings / precisionDenominator : null,
    confirmedFindings,
    falsePositives,
    missedFindings,
    p0p1Misses,
    p2Misses,
    malformedCandidateSamples,
    candidateLatencyP50Ms: percentile(candidateLatencies, 0.5),
    candidateLatencyP95Ms: percentile(candidateLatencies, 0.95),
    referenceLatencyP50Ms: percentile(referenceLatencies, 0.5),
    referenceLatencyP95Ms: percentile(referenceLatencies, 0.95),
    candidateTotalTokens,
    referenceTotalTokens,
    candidateCostUsd,
    referenceCostUsd,
    projectedCostSavingRatio:
      referenceCostUsd > 0 ? (referenceCostUsd - candidateCostUsd) / referenceCostUsd : null,
  };
}

export function screenPromotionCandidate(
  report: BenchmarkReport,
  options: PromotionScreeningOptions = {},
): PromotionScreening {
  if (report.riskTier === 'CRITICAL') {
    return {
      status: 'HUMAN_POLICY_REQUIRED',
      reasons: ['CRITICAL roles cannot be promoted from benchmark economics alone'],
      authorityGranted: false,
    };
  }

  const reasons: string[] = [];
  const floor = PROVISIONAL_PROMOTION_FLOORS[report.riskTier];

  if (report.eligibleSamples < floor.minimumSamples) {
    reasons.push(
      `eligible sample count ${report.eligibleSamples} is below ${floor.minimumSamples}`,
    );
  }

  if (report.agreementRate === null || report.agreementRate < floor.minimumAgreementRate) {
    reasons.push(
      `agreement rate ${formatRate(report.agreementRate)} is below ${formatRate(
        floor.minimumAgreementRate,
      )}`,
    );
  }

  if (report.p0p1Misses > 0) {
    reasons.push(`P0/P1 misses must be zero; observed ${report.p0p1Misses}`);
  }

  if (report.riskTier === 'NORMAL') {
    const minimumCostSavingRatio =
      options.minimumNormalCostSavingRatio ??
      PROVISIONAL_PROMOTION_FLOORS.NORMAL.minimumCostSavingRatio;

    if (
      report.projectedCostSavingRatio === null ||
      report.projectedCostSavingRatio < minimumCostSavingRatio
    ) {
      reasons.push(
        `projected cost saving ${formatRate(
          report.projectedCostSavingRatio,
        )} is below ${formatRate(minimumCostSavingRatio)}`,
      );
    }
  }

  if (report.riskTier === 'HIGH' && options.regressionSuitePassed !== true) {
    reasons.push('HIGH promotion screening requires regression/adversarial suite PASS');
  }

  if (reasons.length === 0) {
    return {
      status: 'PROMOTION_CANDIDATE',
      reasons: ['provisional screening floors satisfied; human/policy decision still required'],
      authorityGranted: false,
    };
  }

  const insufficientData = report.eligibleSamples < floor.minimumSamples;
  return {
    status: insufficientData ? 'INSUFFICIENT_DATA' : 'BLOCKED',
    reasons,
    authorityGranted: false,
  };
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index] ?? null;
}

function pushFinite(target: number[], value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) target.push(value);
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}
