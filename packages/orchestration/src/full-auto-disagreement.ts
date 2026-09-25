import { createHash } from 'node:crypto';

import {
  buildDebateSnapshot,
  createDebateSession,
  evaluateDebate,
  publishDebate,
  recordDebateOpinion,
  type DebateSession,
  type PublishedDebate,
} from './debate-engine.js';

export type FullAutoReviewVerdict = 'APPROVE' | 'REJECT' | 'BLOCKED' | 'INSUFFICIENT';

export interface FullAutoReviewerParticipant {
  readonly id: string;
  readonly logicalRole: string;
  readonly bindingSnapshotHash: string;
  readonly independenceGroup: string;
}

export interface FullAutoReviewCouncilInput {
  readonly id: string;
  readonly version: string;
  readonly maxRounds: number;
  readonly reviewScopeHash: string;
  readonly runSnapshotHash: string;
  readonly producerIndependenceGroup: string;
  readonly reviewers: readonly [FullAutoReviewerParticipant, FullAutoReviewerParticipant];
}

export interface FullAutoReviewCouncil {
  readonly schemaVersion: 1;
  readonly debate: PublishedDebate;
  readonly reviewScopeHash: string;
  readonly runSnapshotHash: string;
  readonly producerIndependenceGroup: string;
  readonly reviewers: readonly [FullAutoReviewerParticipant, FullAutoReviewerParticipant];
  readonly councilHash: string;
  readonly authority: 'NONE';
}

export interface FullAutoReviewSession {
  readonly council: FullAutoReviewCouncil;
  readonly debateSession: DebateSession;
}

export interface FullAutoReviewerOpinionInput {
  readonly reviewerId: string;
  readonly round: number;
  readonly verdict: FullAutoReviewVerdict;
  readonly evidenceHash: string;
  readonly peerContextUsed: boolean;
}

export type FullAutoCouncilStatus =
  | 'WAITING_FOR_REVIEWER'
  | 'PEER_ROUND_REQUIRED'
  | 'APPROVED'
  | 'BLOCKED_BY_REVIEW'
  | 'HUMAN_REQUIRED';

export interface FullAutoCouncilOutcome {
  readonly status: FullAutoCouncilStatus;
  readonly round: number;
  readonly nextRound?: number;
  readonly consensusVerdict?: FullAutoReviewVerdict;
  readonly councilHash: string;
  readonly debateSnapshotHash: string;
  readonly consensusEvidenceHash: string;
  readonly authorityGranted: false;
  readonly reason: string;
}

export function createFullAutoReviewCouncil(
  input: FullAutoReviewCouncilInput,
): FullAutoReviewCouncil {
  requireText(input.id, 'council id');
  requireSha256(input.reviewScopeHash, 'reviewScopeHash');
  requireSha256(input.runSnapshotHash, 'runSnapshotHash');
  const producerIndependenceGroup = requireText(
    input.producerIndependenceGroup,
    'producerIndependenceGroup',
  );

  if (!Number.isInteger(input.maxRounds) || input.maxRounds < 1 || input.maxRounds > 10) {
    throw new Error('Full Auto maxRounds must be an integer between 1 and 10');
  }

  const reviewers = input.reviewers.map(normalizeReviewer) as [
    FullAutoReviewerParticipant,
    FullAutoReviewerParticipant,
  ];
  if (reviewers[0].id === reviewers[1].id) {
    throw new Error('Full Auto reviewer ids must differ');
  }
  if (reviewers[0].logicalRole === reviewers[1].logicalRole) {
    throw new Error('Full Auto reviewer logical roles must differ');
  }
  if (reviewers[0].independenceGroup === reviewers[1].independenceGroup) {
    throw new Error('Full Auto reviewer independence groups must differ');
  }
  if (reviewers.some((reviewer) => reviewer.independenceGroup === producerIndependenceGroup)) {
    throw new Error('Full Auto reviewer must be independent from producer');
  }

  const debate = publishDebate({
    id: input.id,
    version: input.version,
    maxRounds: input.maxRounds,
    participants: reviewers.map((reviewer) => ({
      id: reviewer.id,
      roleVersion: `${reviewer.logicalRole}@${reviewer.bindingSnapshotHash}`,
      independenceGroup: reviewer.independenceGroup,
    })),
  });

  const identity = {
    schemaVersion: 1,
    debateHash: debate.debateHash,
    reviewScopeHash: input.reviewScopeHash,
    runSnapshotHash: input.runSnapshotHash,
    producerIndependenceGroup,
    reviewers: [...reviewers].sort((left, right) => left.id.localeCompare(right.id)),
  } as const;

  return {
    schemaVersion: 1,
    debate,
    reviewScopeHash: input.reviewScopeHash,
    runSnapshotHash: input.runSnapshotHash,
    producerIndependenceGroup,
    reviewers,
    councilHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function createFullAutoReviewSession(council: FullAutoReviewCouncil): FullAutoReviewSession {
  validateCouncil(council);
  return {
    council,
    debateSession: createDebateSession(council.debate),
  };
}

export function recordFullAutoReviewerOpinion(
  session: FullAutoReviewSession,
  input: FullAutoReviewerOpinionInput,
): FullAutoReviewSession {
  if (!['APPROVE', 'REJECT', 'BLOCKED', 'INSUFFICIENT'].includes(input.verdict)) {
    throw new Error('Full Auto reviewer verdict is invalid');
  }
  requireSha256(input.evidenceHash, 'reviewer evidenceHash');

  return {
    council: session.council,
    debateSession: recordDebateOpinion(session.debateSession, {
      participantId: input.reviewerId,
      round: input.round,
      verdict: input.verdict,
      evidenceHash: input.evidenceHash,
      peerContextUsed: input.peerContextUsed,
    }),
  };
}

export function evaluateFullAutoReviewCouncil(
  session: FullAutoReviewSession,
): FullAutoCouncilOutcome {
  validateCouncil(session.council);
  if (session.debateSession.debate.debateHash !== session.council.debate.debateHash) {
    throw new Error('Full Auto debate session does not match council');
  }

  const debateOutcome = evaluateDebate(session.debateSession);
  const debateSnapshot = buildDebateSnapshot(session.debateSession);

  let status: FullAutoCouncilStatus;
  let reason: string;
  let consensusVerdict: FullAutoReviewVerdict | undefined;

  if (debateOutcome.status === 'INCOMPLETE') {
    status = 'WAITING_FOR_REVIEWER';
    reason = 'all reviewer opinions are required for the current round';
  } else if (debateOutcome.status === 'CONTINUE') {
    status = 'PEER_ROUND_REQUIRED';
    reason = 'reviewers disagree and a bounded peer-aware round remains';
  } else if (debateOutcome.status === 'HUMAN_REQUIRED') {
    status = 'HUMAN_REQUIRED';
    reason = 'bounded reviewer disagreement is exhausted';
  } else {
    if (!isFullAutoVerdict(debateOutcome.consensusVerdict)) {
      throw new Error('Full Auto debate consensus verdict is invalid');
    }
    consensusVerdict = debateOutcome.consensusVerdict;
    if (consensusVerdict === 'APPROVE') {
      status = 'APPROVED';
      reason = 'both reviewers unanimously APPROVE the exact bounded review session';
    } else {
      status = 'BLOCKED_BY_REVIEW';
      reason = `unanimous ${consensusVerdict} cannot authorize autonomous merge`;
    }
  }

  const evidenceIdentity = {
    councilHash: session.council.councilHash,
    debateSnapshotHash: debateSnapshot.snapshotHash,
    status,
    round: debateOutcome.round,
    nextRound: debateOutcome.nextRound ?? null,
    consensusVerdict: consensusVerdict ?? null,
  };

  return {
    status,
    round: debateOutcome.round,
    ...(debateOutcome.nextRound === undefined ? {} : { nextRound: debateOutcome.nextRound }),
    ...(consensusVerdict === undefined ? {} : { consensusVerdict }),
    councilHash: session.council.councilHash,
    debateSnapshotHash: debateSnapshot.snapshotHash,
    consensusEvidenceHash: sha256(canonicalJson(evidenceIdentity)),
    authorityGranted: false,
    reason,
  };
}

export function fullAutoBoundedDisagreementCanGrantAuthority(): false {
  return false;
}

export function fullAutoNonApproveConsensusCanMerge(): false {
  return false;
}

function validateCouncil(council: FullAutoReviewCouncil): void {
  if (council.schemaVersion !== 1) throw new Error('Full Auto council schemaVersion must be 1');
  if (council.authority !== 'NONE') throw new Error('Full Auto council authority must be NONE');
  requireSha256(council.reviewScopeHash, 'reviewScopeHash');
  requireSha256(council.runSnapshotHash, 'runSnapshotHash');
  requireSha256(council.councilHash, 'councilHash');
}

function normalizeReviewer(reviewer: FullAutoReviewerParticipant): FullAutoReviewerParticipant {
  return {
    id: requireText(reviewer.id, 'reviewer id'),
    logicalRole: requireText(reviewer.logicalRole, 'reviewer logicalRole'),
    bindingSnapshotHash: requireSha256(reviewer.bindingSnapshotHash, 'bindingSnapshotHash'),
    independenceGroup: requireText(reviewer.independenceGroup, 'reviewer independenceGroup'),
  };
}

function isFullAutoVerdict(value: string | undefined): value is FullAutoReviewVerdict {
  return value !== undefined && ['APPROVE', 'REJECT', 'BLOCKED', 'INSUFFICIENT'].includes(value);
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireSha256(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return value;
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
