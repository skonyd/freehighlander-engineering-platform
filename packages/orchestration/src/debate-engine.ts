import { createHash } from 'node:crypto';

export interface DebateParticipant {
  readonly id: string;
  readonly roleVersion: string;
  readonly independenceGroup: string;
}

export interface DebateDefinition {
  readonly id: string;
  readonly version: string;
  readonly maxRounds: number;
  readonly participants: readonly DebateParticipant[];
}

export interface PublishedDebate {
  readonly definition: DebateDefinition;
  readonly debateHash: string;
}

export interface DebateOpinion {
  readonly participantId: string;
  readonly round: number;
  readonly verdict: string;
  readonly evidenceHash: string;
  readonly peerContextUsed: boolean;
}

export interface DebateSession {
  readonly debate: PublishedDebate;
  readonly opinions: readonly DebateOpinion[];
}

export type DebateOutcomeStatus = 'INCOMPLETE' | 'CONTINUE' | 'CONSENSUS' | 'HUMAN_REQUIRED';

export interface DebateOutcome {
  readonly status: DebateOutcomeStatus;
  readonly round: number;
  readonly consensusVerdict?: string;
  readonly nextRound?: number;
  readonly authorityGranted: false;
  readonly reason: string;
}

export interface DebateSnapshot {
  readonly debateHash: string;
  readonly opinionsHash: string;
  readonly snapshotHash: string;
}

export function publishDebate(definition: DebateDefinition): PublishedDebate {
  validateDebateDefinition(definition);
  const normalized: DebateDefinition = {
    id: definition.id,
    version: definition.version,
    maxRounds: definition.maxRounds,
    participants: definition.participants
      .map((participant) => ({ ...participant }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  return {
    definition: normalized,
    debateHash: sha256(canonicalJson(normalized)),
  };
}

export function validateDebateDefinition(definition: DebateDefinition): void {
  requireText(definition.id, 'debate id');
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new Error('debate version must be semantic version x.y.z');
  }
  if (!Number.isInteger(definition.maxRounds) || definition.maxRounds < 1) {
    throw new Error('debate maxRounds must be >= 1');
  }
  if (definition.participants.length < 2) {
    throw new Error('debate requires at least two participants');
  }

  const ids = new Set<string>();
  for (const participant of definition.participants) {
    requireText(participant.id, 'participant id');
    requireText(participant.roleVersion, 'participant roleVersion');
    requireText(participant.independenceGroup, 'participant independenceGroup');
    if (ids.has(participant.id)) throw new Error(`duplicate debate participant: ${participant.id}`);
    ids.add(participant.id);
  }
}

export function createDebateSession(debate: PublishedDebate): DebateSession {
  return { debate, opinions: [] };
}

export function recordDebateOpinion(session: DebateSession, opinion: DebateOpinion): DebateSession {
  const participant = session.debate.definition.participants.find(
    (candidate) => candidate.id === opinion.participantId,
  );
  if (!participant) throw new Error(`unknown debate participant: ${opinion.participantId}`);
  if (!Number.isInteger(opinion.round) || opinion.round < 0) {
    throw new Error('debate round must be a non-negative integer');
  }
  if (opinion.round >= session.debate.definition.maxRounds) {
    throw new Error('debate round exceeds maxRounds');
  }
  requireText(opinion.verdict, 'opinion verdict');
  requireText(opinion.evidenceHash, 'opinion evidenceHash');

  if (opinion.round === 0 && opinion.peerContextUsed) {
    throw new Error('debate round zero must be independent');
  }

  if (
    session.opinions.some(
      (existing) =>
        existing.participantId === opinion.participantId && existing.round === opinion.round,
    )
  ) {
    throw new Error(`duplicate debate opinion: ${opinion.participantId} round ${opinion.round}`);
  }

  const highestRound = session.opinions.reduce(
    (max, existing) => Math.max(max, existing.round),
    -1,
  );
  if (opinion.round > highestRound + 1) {
    throw new Error('debate rounds cannot be skipped');
  }

  if (opinion.round > 0 && !isRoundComplete(session, opinion.round - 1)) {
    throw new Error('previous debate round must be complete');
  }

  return {
    debate: session.debate,
    opinions: [...session.opinions, { ...opinion }],
  };
}

export function evaluateDebate(session: DebateSession): DebateOutcome {
  const maxRounds = session.debate.definition.maxRounds;
  const currentRound = session.opinions.reduce((max, opinion) => Math.max(max, opinion.round), 0);
  const roundOpinions = opinionsForRound(session, currentRound);

  if (roundOpinions.length < session.debate.definition.participants.length) {
    return {
      status: 'INCOMPLETE',
      round: currentRound,
      authorityGranted: false,
      reason: 'all participant opinions are required before evaluation',
    };
  }

  const verdicts = new Set(roundOpinions.map((opinion) => opinion.verdict));
  if (verdicts.size === 1) {
    return {
      status: 'CONSENSUS',
      round: currentRound,
      consensusVerdict: roundOpinions[0]!.verdict,
      authorityGranted: false,
      reason: 'participants agree; consensus remains advisory and non-authoritative',
    };
  }

  if (currentRound + 1 < maxRounds) {
    return {
      status: 'CONTINUE',
      round: currentRound,
      nextRound: currentRound + 1,
      authorityGranted: false,
      reason: 'disagreement remains and bounded rounds are available',
    };
  }

  return {
    status: 'HUMAN_REQUIRED',
    round: currentRound,
    authorityGranted: false,
    reason: 'bounded debate exhausted with unresolved disagreement',
  };
}

export function buildDebateSnapshot(session: DebateSession): DebateSnapshot {
  const opinions = [...session.opinions].sort(
    (left, right) =>
      left.round - right.round || left.participantId.localeCompare(right.participantId),
  );
  const opinionsHash = sha256(canonicalJson(opinions));
  const identity = {
    debateHash: session.debate.debateHash,
    opinionsHash,
  };
  return {
    ...identity,
    snapshotHash: sha256(canonicalJson(identity)),
  };
}

export function debateConsensusCanGrantAuthority(): false {
  return false;
}

export function debateConfigurationCanGrantAuthority(): false {
  return false;
}

function opinionsForRound(session: DebateSession, round: number): readonly DebateOpinion[] {
  return session.opinions
    .filter((opinion) => opinion.round === round)
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
}

function isRoundComplete(session: DebateSession, round: number): boolean {
  return opinionsForRound(session, round).length === session.debate.definition.participants.length;
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
