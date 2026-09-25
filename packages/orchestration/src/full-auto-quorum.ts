import { createHash } from 'node:crypto';

export type FullAutoReviewerVerdict = 'APPROVE' | 'REJECT' | 'BLOCKED' | 'INSUFFICIENT';

export interface FullAutoQuorumScope {
  readonly repository: string;
  readonly headRevision: string;
  readonly baseRevision: string;
  readonly runSnapshotHash: string;
  readonly policyHash: string;
  readonly catalogSnapshotHash: string;
  readonly requiredEvidenceHash: string;
  readonly reviewScopeHash: string;
  readonly changeBudgetResultHash: string;
  readonly runtimeContainmentHash: string;
  readonly testReviewEvidenceHash?: string;
  readonly candidateEvidenceHash?: string;
}

export interface FullAutoReviewerEvidence {
  readonly reviewerId: string;
  readonly logicalRole: string;
  readonly bindingSnapshotHash: string;
  readonly independenceGroup: string;
  readonly round: number;
  readonly peerContextUsed: boolean;
  readonly verdict: FullAutoReviewerVerdict;
  readonly findingsHash: string;
  readonly scopeHash: string;
}

export interface FullAutoQuorumInput {
  readonly scope: FullAutoQuorumScope;
  readonly producerIndependenceGroup: string;
  readonly reviewers: readonly FullAutoReviewerEvidence[];
}

export type FullAutoQuorumStatus =
  | 'APPROVED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'INSUFFICIENT';

export interface FullAutoQuorumArtifact {
  readonly schemaVersion: 1;
  readonly scope: FullAutoQuorumScope;
  readonly producerIndependenceGroup: string;
  readonly reviewers: readonly FullAutoReviewerEvidence[];
  readonly status: FullAutoQuorumStatus;
  readonly quorumHash: string;
  readonly authorityGranted: false;
}

export function buildFullAutoQuorumArtifact(input: FullAutoQuorumInput): FullAutoQuorumArtifact {
  const scope = normalizeScope(input.scope);
  const producerIndependenceGroup = requireText(
    input.producerIndependenceGroup,
    'producerIndependenceGroup',
  );

  if (input.reviewers.length !== 2) {
    throw new Error('Full Auto quorum requires exactly two reviewers');
  }

  const reviewers = input.reviewers
    .map((reviewer) => normalizeReviewer(reviewer, scope.reviewScopeHash))
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));

  if (reviewers[0]!.reviewerId === reviewers[1]!.reviewerId) {
    throw new Error('Full Auto quorum reviewer ids must differ');
  }
  if (reviewers[0]!.logicalRole === reviewers[1]!.logicalRole) {
    throw new Error('Full Auto quorum logical reviewer roles must differ');
  }
  if (reviewers[0]!.independenceGroup === reviewers[1]!.independenceGroup) {
    throw new Error('Full Auto quorum reviewer independence groups must differ');
  }
  if (reviewers.some((reviewer) => reviewer.independenceGroup === producerIndependenceGroup)) {
    throw new Error('Full Auto reviewer must be independent from the producer');
  }

  const status = evaluateReviewerVerdicts(reviewers.map((reviewer) => reviewer.verdict));
  const identity = {
    schemaVersion: 1,
    scope,
    producerIndependenceGroup,
    reviewers,
    status,
  } as const;

  return {
    ...identity,
    quorumHash: sha256(canonicalJson(identity)),
    authorityGranted: false,
  };
}

export function validateFullAutoQuorumArtifact(artifact: FullAutoQuorumArtifact): void {
  if (artifact.schemaVersion !== 1) {
    throw new Error('Full Auto quorum schemaVersion must be 1');
  }
  if (artifact.authorityGranted !== false) {
    throw new Error('Full Auto quorum cannot grant authority');
  }

  const rebuilt = buildFullAutoQuorumArtifact({
    scope: artifact.scope,
    producerIndependenceGroup: artifact.producerIndependenceGroup,
    reviewers: artifact.reviewers,
  });

  if (rebuilt.status !== artifact.status) {
    throw new Error('Full Auto quorum status mismatch');
  }
  if (rebuilt.quorumHash !== artifact.quorumHash) {
    throw new Error('Full Auto quorum hash mismatch');
  }
}

export function fullAutoQuorumCanGrantAuthority(): false {
  return false;
}

export function fullAutoQuorumIsMergeEvidenceComplete(
  artifact: FullAutoQuorumArtifact,
): boolean {
  validateFullAutoQuorumArtifact(artifact);
  return artifact.status === 'APPROVED';
}

function normalizeScope(scope: FullAutoQuorumScope): FullAutoQuorumScope {
  const normalized: FullAutoQuorumScope = {
    repository: requireText(scope.repository, 'repository'),
    headRevision: requireText(scope.headRevision, 'headRevision'),
    baseRevision: requireText(scope.baseRevision, 'baseRevision'),
    runSnapshotHash: requireSha256(scope.runSnapshotHash, 'runSnapshotHash'),
    policyHash: requireSha256(scope.policyHash, 'policyHash'),
    catalogSnapshotHash: requireSha256(scope.catalogSnapshotHash, 'catalogSnapshotHash'),
    requiredEvidenceHash: requireSha256(scope.requiredEvidenceHash, 'requiredEvidenceHash'),
    reviewScopeHash: requireSha256(scope.reviewScopeHash, 'reviewScopeHash'),
    changeBudgetResultHash: requireSha256(
      scope.changeBudgetResultHash,
      'changeBudgetResultHash',
    ),
    runtimeContainmentHash: requireSha256(
      scope.runtimeContainmentHash,
      'runtimeContainmentHash',
    ),
    ...(scope.testReviewEvidenceHash === undefined
      ? {}
      : {
          testReviewEvidenceHash: requireSha256(
            scope.testReviewEvidenceHash,
            'testReviewEvidenceHash',
          ),
        }),
    ...(scope.candidateEvidenceHash === undefined
      ? {}
      : {
          candidateEvidenceHash: requireSha256(
            scope.candidateEvidenceHash,
            'candidateEvidenceHash',
          ),
        }),
  };

  return normalized;
}

function normalizeReviewer(
  reviewer: FullAutoReviewerEvidence,
  expectedScopeHash: string,
): FullAutoReviewerEvidence {
  const normalized: FullAutoReviewerEvidence = {
    reviewerId: requireText(reviewer.reviewerId, 'reviewerId'),
    logicalRole: requireText(reviewer.logicalRole, 'logicalRole'),
    bindingSnapshotHash: requireSha256(reviewer.bindingSnapshotHash, 'bindingSnapshotHash'),
    independenceGroup: requireText(reviewer.independenceGroup, 'independenceGroup'),
    round: reviewer.round,
    peerContextUsed: reviewer.peerContextUsed,
    verdict: reviewer.verdict,
    findingsHash: requireSha256(reviewer.findingsHash, 'findingsHash'),
    scopeHash: requireSha256(reviewer.scopeHash, 'scopeHash'),
  };

  if (!Number.isInteger(normalized.round) || normalized.round !== 0) {
    throw new Error('Full Auto quorum requires independent round zero reviewer evidence');
  }
  if (normalized.peerContextUsed) {
    throw new Error('Full Auto quorum round zero reviewers may not use peer context');
  }
  if (normalized.scopeHash !== expectedScopeHash) {
    throw new Error('Full Auto reviewer scope hash mismatch');
  }
  if (!['APPROVE', 'REJECT', 'BLOCKED', 'INSUFFICIENT'].includes(normalized.verdict)) {
    throw new Error('Full Auto reviewer verdict is invalid');
  }

  return normalized;
}

function evaluateReviewerVerdicts(
  verdicts: readonly FullAutoReviewerVerdict[],
): FullAutoQuorumStatus {
  if (verdicts.every((verdict) => verdict === 'APPROVE')) return 'APPROVED';
  if (verdicts.includes('REJECT')) return 'REJECTED';
  if (verdicts.includes('BLOCKED')) return 'BLOCKED';
  return 'INSUFFICIENT';
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireSha256(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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
