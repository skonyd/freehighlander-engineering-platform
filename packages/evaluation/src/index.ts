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
  | 'CONFIRMED'
  | 'FALSE_POSITIVE'
  | 'MISSED_BY_CANDIDATE'
  | 'UNRESOLVED';

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
  const candidatePromise = settleWorker(input.candidate, input.authoritativeInput, inputHash, candidateStarted, now);
  const referenceStarted = now();
  const referencePromise = settleWorker(input.reference, input.authoritativeInput, inputHash, referenceStarted, now);
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
