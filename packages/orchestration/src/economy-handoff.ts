import { createHash } from 'node:crypto';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export interface EconomyEvidenceReference {
  readonly artifactId: string;
  readonly contentHash: string;
}

export interface CompactAgentFinding {
  readonly findingId: string;
  readonly severity: 'P0' | 'P1' | 'P2' | 'P3';
  readonly summary: string;
  readonly evidence: readonly EconomyEvidenceReference[];
}

export interface CompactAgentHandoffInput {
  readonly handoffId: string;
  readonly sourceRole: string;
  readonly targetRole: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly scopeHash: string;
  readonly status: 'SUCCEEDED' | 'BLOCKED' | 'FAILED' | 'HUMAN_REQUIRED';
  readonly verdict?: 'PASS' | 'BLOCKED' | 'APPROVE' | 'REJECT' | 'SUFFICIENT' | 'INSUFFICIENT';
  readonly findings: readonly CompactAgentFinding[];
  readonly evidence: readonly EconomyEvidenceReference[];
  readonly unresolvedQuestions: readonly string[];
  readonly minimalRationale: readonly string[];
  readonly provenanceHashes: readonly string[];
  readonly intendedForIndependentRoundZero: boolean;
}

export interface CompactAgentHandoffV1 {
  readonly schemaVersion: 1;
  readonly handoffId: string;
  readonly sourceRole: string;
  readonly targetRole: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly scopeHash: string;
  readonly status: CompactAgentHandoffInput['status'];
  readonly verdict?: CompactAgentHandoffInput['verdict'];
  readonly findings: readonly CompactAgentFinding[];
  readonly evidence: readonly EconomyEvidenceReference[];
  readonly unresolvedQuestions: readonly string[];
  readonly minimalRationale: readonly string[];
  readonly provenanceHashes: readonly string[];
  readonly intendedForIndependentRoundZero: boolean;
  readonly fullTrajectoryIncluded: false;
  readonly handoffHash: string;
  readonly authority: 'NONE';
}

export interface LocalPreSolveSlice {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly selector: string;
}

export interface LocalPreSolveVerificationPacketInput {
  readonly packetId: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly scopeHash: string;
  readonly taskHash: string;
  readonly acceptanceCriteriaHashes: readonly string[];
  readonly requiredEvidence: readonly EconomyEvidenceReference[];
  readonly relevantSlices: readonly LocalPreSolveSlice[];
  readonly candidateArtifact?: EconomyEvidenceReference;
  readonly provenanceHashes: readonly string[];
  readonly independentRoundZero: boolean;
  readonly advisoryVerdict?: string;
  readonly exploratoryTranscriptIncluded?: boolean;
}

export interface LocalPreSolveVerificationPacketV1 {
  readonly schemaVersion: 1;
  readonly packetId: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly scopeHash: string;
  readonly taskHash: string;
  readonly acceptanceCriteriaHashes: readonly string[];
  readonly requiredEvidence: readonly EconomyEvidenceReference[];
  readonly relevantSlices: readonly LocalPreSolveSlice[];
  readonly candidateArtifact?: EconomyEvidenceReference;
  readonly provenanceHashes: readonly string[];
  readonly independentRoundZero: boolean;
  readonly exploratoryTranscriptIncluded: false;
  readonly remoteExploratoryContextReduced: true;
  readonly packetHash: string;
  readonly authority: 'NONE';
}

export interface ReadOnlyRemoteQuestion {
  readonly questionId: string;
  readonly logicalRole: string;
  readonly exactRevision: string;
  readonly runSnapshotHash: string;
  readonly scopeHash: string;
  readonly packetHash: string;
  readonly readOnly: boolean;
  readonly independentOpinionRequired: boolean;
}

export type RemoteCallCoalescingStatus = 'COALESCE' | 'SEPARATE';

export type RemoteCallCoalescingReason =
  | 'SAME_IMMUTABLE_SCOPE'
  | 'READ_ONLY_REQUIRED'
  | 'INDEPENDENCE_REQUIRED'
  | 'ROLE_MISMATCH'
  | 'SNAPSHOT_MISMATCH';

export interface RemoteCallCoalescingPlanV1 {
  readonly schemaVersion: 1;
  readonly status: RemoteCallCoalescingStatus;
  readonly reason: RemoteCallCoalescingReason;
  readonly questionIds: readonly string[];
  readonly combinedRequestHash: string | null;
  readonly authority: 'NONE';
}

export function buildCompactAgentHandoff(input: CompactAgentHandoffInput): CompactAgentHandoffV1 {
  requireId(input.handoffId, 'handoffId');
  requireId(input.sourceRole, 'sourceRole');
  requireId(input.targetRole, 'targetRole');
  requireText(input.exactRevision, 'exactRevision');
  requireHash(input.runSnapshotHash, 'runSnapshotHash');
  requireHash(input.scopeHash, 'scopeHash');

  if (
    input.status !== 'SUCCEEDED' &&
    input.status !== 'BLOCKED' &&
    input.status !== 'FAILED' &&
    input.status !== 'HUMAN_REQUIRED'
  ) {
    throw new Error('handoff status is invalid');
  }

  if (input.intendedForIndependentRoundZero) {
    if (input.verdict !== undefined) {
      throw new Error('independent round-zero handoff must not include a prior verdict');
    }
    if (
      input.findings.length > 0 ||
      input.unresolvedQuestions.length > 0 ||
      input.minimalRationale.length > 0
    ) {
      throw new Error('independent round-zero handoff may contain evidence indexes only');
    }
  }

  const findings = [...input.findings]
    .map((finding) => normalizeFinding(finding))
    .sort((left, right) => left.findingId.localeCompare(right.findingId));
  const evidence = normalizeEvidence(input.evidence);
  const unresolvedQuestions = normalizeUniqueText(input.unresolvedQuestions, 'unresolved question');
  const minimalRationale = normalizeUniqueText(input.minimalRationale, 'minimal rationale');
  const provenanceHashes = uniqueSortedHashes(input.provenanceHashes, 'provenance hash');

  const canonical = {
    schemaVersion: 1,
    handoffId: input.handoffId,
    sourceRole: input.sourceRole,
    targetRole: input.targetRole,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    scopeHash: input.scopeHash,
    status: input.status,
    verdict: input.verdict ?? null,
    findings,
    evidence,
    unresolvedQuestions,
    minimalRationale,
    provenanceHashes,
    intendedForIndependentRoundZero: input.intendedForIndependentRoundZero,
    fullTrajectoryIncluded: false,
  } as const;

  return {
    schemaVersion: 1,
    handoffId: input.handoffId,
    sourceRole: input.sourceRole,
    targetRole: input.targetRole,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    scopeHash: input.scopeHash,
    status: input.status,
    ...(input.verdict === undefined ? {} : { verdict: input.verdict }),
    findings,
    evidence,
    unresolvedQuestions,
    minimalRationale,
    provenanceHashes,
    intendedForIndependentRoundZero: input.intendedForIndependentRoundZero,
    fullTrajectoryIncluded: false,
    handoffHash: sha256(canonicalJson(canonical)),
    authority: 'NONE',
  };
}

export function buildLocalPreSolveVerificationPacket(
  input: LocalPreSolveVerificationPacketInput,
): LocalPreSolveVerificationPacketV1 {
  requireId(input.packetId, 'packetId');
  requireText(input.exactRevision, 'exactRevision');
  for (const [name, value] of [
    ['runSnapshotHash', input.runSnapshotHash],
    ['scopeHash', input.scopeHash],
    ['taskHash', input.taskHash],
  ] as const) {
    requireHash(value, name);
  }

  if (input.exploratoryTranscriptIncluded === true) {
    throw new Error('local pre-solve packet must not include exploratory transcript');
  }
  if (input.independentRoundZero && input.advisoryVerdict !== undefined) {
    throw new Error('independent round-zero packet must not include local advisory verdict');
  }

  const acceptanceCriteriaHashes = uniqueSortedHashes(
    input.acceptanceCriteriaHashes,
    'acceptance criteria hash',
  );
  if (acceptanceCriteriaHashes.length === 0) {
    throw new Error('local pre-solve packet requires acceptance criteria');
  }

  const requiredEvidence = normalizeEvidence(input.requiredEvidence);
  if (requiredEvidence.length === 0) {
    throw new Error('local pre-solve packet requires exact evidence');
  }

  const relevantSlices = [...input.relevantSlices]
    .map((slice) => {
      requireId(slice.artifactId, 'slice artifactId');
      requireHash(slice.contentHash, 'slice contentHash');
      const selector = requireBoundedText(slice.selector, 'slice selector', 240);
      return { ...slice, selector };
    })
    .sort((left, right) =>
      [left.artifactId, left.selector]
        .join('\0')
        .localeCompare([right.artifactId, right.selector].join('\0')),
    );

  const candidateArtifact =
    input.candidateArtifact === undefined
      ? undefined
      : normalizeEvidence([input.candidateArtifact])[0];
  const provenanceHashes = uniqueSortedHashes(input.provenanceHashes, 'provenance hash');

  const canonical = {
    schemaVersion: 1,
    packetId: input.packetId,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    scopeHash: input.scopeHash,
    taskHash: input.taskHash,
    acceptanceCriteriaHashes,
    requiredEvidence,
    relevantSlices,
    candidateArtifact: candidateArtifact ?? null,
    provenanceHashes,
    independentRoundZero: input.independentRoundZero,
    exploratoryTranscriptIncluded: false,
    remoteExploratoryContextReduced: true,
  } as const;

  return {
    schemaVersion: 1,
    packetId: input.packetId,
    exactRevision: input.exactRevision,
    runSnapshotHash: input.runSnapshotHash,
    scopeHash: input.scopeHash,
    taskHash: input.taskHash,
    acceptanceCriteriaHashes,
    requiredEvidence,
    relevantSlices,
    ...(candidateArtifact === undefined ? {} : { candidateArtifact }),
    provenanceHashes,
    independentRoundZero: input.independentRoundZero,
    exploratoryTranscriptIncluded: false,
    remoteExploratoryContextReduced: true,
    packetHash: sha256(canonicalJson(canonical)),
    authority: 'NONE',
  };
}

export function planReadOnlyRemoteCallCoalescing(
  questions: readonly ReadOnlyRemoteQuestion[],
): RemoteCallCoalescingPlanV1 {
  if (questions.length < 2) {
    throw new Error('remote-call coalescing requires at least two questions');
  }

  const normalized = [...questions]
    .map((question) => {
      requireId(question.questionId, 'questionId');
      requireId(question.logicalRole, 'logicalRole');
      requireText(question.exactRevision, 'exactRevision');
      requireHash(question.runSnapshotHash, 'runSnapshotHash');
      requireHash(question.scopeHash, 'scopeHash');
      requireHash(question.packetHash, 'packetHash');
      return question;
    })
    .sort((left, right) => left.questionId.localeCompare(right.questionId));

  if (new Set(normalized.map((question) => question.questionId)).size !== normalized.length) {
    throw new Error('remote-call coalescing questionId must be unique');
  }

  const questionIds = normalized.map((question) => question.questionId);
  if (normalized.some((question) => !question.readOnly)) {
    return separate(questionIds, 'READ_ONLY_REQUIRED');
  }
  if (normalized.some((question) => question.independentOpinionRequired)) {
    return separate(questionIds, 'INDEPENDENCE_REQUIRED');
  }

  const first = normalized[0]!;
  if (normalized.some((question) => question.logicalRole !== first.logicalRole)) {
    return separate(questionIds, 'ROLE_MISMATCH');
  }

  if (
    normalized.some(
      (question) =>
        question.exactRevision !== first.exactRevision ||
        question.runSnapshotHash !== first.runSnapshotHash ||
        question.scopeHash !== first.scopeHash ||
        question.packetHash !== first.packetHash,
    )
  ) {
    return separate(questionIds, 'SNAPSHOT_MISMATCH');
  }

  return {
    schemaVersion: 1,
    status: 'COALESCE',
    reason: 'SAME_IMMUTABLE_SCOPE',
    questionIds,
    combinedRequestHash: sha256(
      canonicalJson({
        logicalRole: first.logicalRole,
        exactRevision: first.exactRevision,
        runSnapshotHash: first.runSnapshotHash,
        scopeHash: first.scopeHash,
        packetHash: first.packetHash,
        questionIds,
      }),
    ),
    authority: 'NONE',
  };
}

export function economyHandoffCanIncludeFullPrivateTrajectory(): false {
  return false;
}

export function localPreSolveCanLeakVerdictIntoIndependentRoundZero(): false {
  return false;
}

export function remoteCallCoalescingCanMergeIndependentOpinions(): false {
  return false;
}

function separate(
  questionIds: readonly string[],
  reason: Exclude<RemoteCallCoalescingReason, 'SAME_IMMUTABLE_SCOPE'>,
): RemoteCallCoalescingPlanV1 {
  return {
    schemaVersion: 1,
    status: 'SEPARATE',
    reason,
    questionIds,
    combinedRequestHash: null,
    authority: 'NONE',
  };
}

function normalizeFinding(finding: CompactAgentFinding): CompactAgentFinding {
  requireId(finding.findingId, 'findingId');
  if (!['P0', 'P1', 'P2', 'P3'].includes(finding.severity)) {
    throw new Error('finding severity is invalid');
  }
  const summary = requireBoundedText(finding.summary, 'finding summary', 500);
  const evidence = normalizeEvidence(finding.evidence);
  if (evidence.length === 0) throw new Error('finding requires evidence');
  return { ...finding, summary, evidence };
}

function normalizeEvidence(
  evidence: readonly EconomyEvidenceReference[],
): readonly EconomyEvidenceReference[] {
  const seen = new Set<string>();
  return [...evidence]
    .map((reference) => {
      requireId(reference.artifactId, 'artifactId');
      requireHash(reference.contentHash, 'contentHash');
      const key = reference.artifactId + ':' + reference.contentHash;
      if (seen.has(key)) throw new Error('duplicate evidence reference: ' + reference.artifactId);
      seen.add(key);
      return { ...reference };
    })
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

function normalizeUniqueText(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  const normalized = values.map((value) => requireBoundedText(value, label, 500));
  for (const value of normalized) {
    if (seen.has(value)) throw new Error('duplicate ' + label);
    seen.add(value);
  }
  return [...normalized].sort();
}

function uniqueSortedHashes(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    requireHash(value, label);
    if (seen.has(value)) throw new Error('duplicate ' + label);
    seen.add(value);
  }
  return [...seen].sort();
}

function requireId(value: string, field: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(field + ' must be a bounded identifier');
}

function requireHash(value: string, field: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(field + ' must be lowercase sha256');
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  return normalized;
}

function requireBoundedText(value: string, field: string, max: number): string {
  const normalized = requireText(value, field);
  if (normalized.length > max || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be bounded single-line text');
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key]))
      .join(',') +
    '}'
  );
}
