import { createHash } from 'node:crypto';

import {
  createHumanApprovalRequest,
  recordHumanDecision,
  verifyHumanDecisionBinding,
  type HumanApprovalRequest,
  type HumanDecision,
  type PolicyDecision,
  type PolicyEffect,
} from './policy-engine.js';
import {
  evaluateV3CutoverReadiness,
  type CutoverReadinessResult,
} from './cutover-readiness.js';

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface V3CutoverApprovalPacketInput {
  readonly repository: string;
  readonly targetRevision: string;
  readonly provisionalReferenceSha: string;
  readonly finalAcceptedReferenceSha: string;
  readonly parityReferenceSha: string;
  readonly runSnapshotHash: string;
  readonly evidenceHash: string;
  readonly promotionReviewHash: string;
  readonly humanGatePolicyDecision: PolicyDecision;
}

export interface V3CutoverApprovalPacketV1 {
  readonly schemaVersion: 1;
  readonly action: 'PROMOTE_V3_AUTHORITY';
  readonly repository: string;
  readonly targetRevision: string;
  readonly provisionalReferenceSha: string;
  readonly finalAcceptedReferenceSha: string;
  readonly parityReferenceSha: string;
  readonly runSnapshotHash: string;
  readonly evidenceHash: string;
  readonly promotionReviewHash: string;
  readonly humanGatePolicyHash: string;
  readonly humanApprovalRequest: HumanApprovalRequest;
  readonly packetHash: string;
  readonly cutoverApplied: false;
  readonly authorityEnabled: false;
  readonly authority: 'NONE';
}

export interface V3CutoverObservedState {
  readonly targetRevision: string;
  readonly finalAcceptedReferenceSha: string;
  readonly parityReferenceSha: string;
  readonly runSnapshotHash: string;
  readonly evidenceHash: string;
  readonly promotionReviewHash: string;
  readonly humanGatePolicyHash: string;
}

export interface V3CutoverPacketCurrentness {
  readonly status: 'CURRENT' | 'STALE';
  readonly reasons: readonly string[];
  readonly authority: 'NONE';
}

export interface V3CutoverApprovalPreviewInput {
  readonly packet: V3CutoverApprovalPacketV1;
  readonly observed: V3CutoverObservedState;
  readonly humanDecision: HumanDecision | null;
  readonly systemPolicyDecision: PolicyDecision;
  readonly deltaReviewed: boolean;
  readonly paritySuitePassed: boolean;
  readonly postPortSmokePassed: boolean;
  readonly authorityPromotionReviewed: boolean;
  readonly parityStatus: 'PASS' | 'MISMATCH' | 'INSUFFICIENT_EVIDENCE' | 'UNAVAILABLE';
}

export interface V3CutoverApprovalPreviewV1 {
  readonly schemaVersion: 1;
  readonly status: 'READY' | 'BLOCKED';
  readonly packetHash: string;
  readonly currentness: V3CutoverPacketCurrentness;
  readonly systemPolicyCurrent: boolean;
  readonly humanApprovalVerified: boolean;
  readonly humanDecision: 'APPROVE' | 'DENY' | 'MISSING';
  readonly systemPolicyEffect: PolicyEffect;
  readonly reasons: readonly string[];
  readonly readiness: CutoverReadinessResult;
  readonly cutoverApplied: false;
  readonly authorityEnabled: false;
  readonly authority: 'NONE';
}

export function buildV3CutoverApprovalPacket(
  input: V3CutoverApprovalPacketInput,
): V3CutoverApprovalPacketV1 {
  requireText(input.repository, 'repository');
  requireGitSha(input.targetRevision, 'targetRevision');
  requireGitSha(input.provisionalReferenceSha, 'provisionalReferenceSha');
  requireGitSha(input.finalAcceptedReferenceSha, 'finalAcceptedReferenceSha');
  requireGitSha(input.parityReferenceSha, 'parityReferenceSha');
  requireSha256(input.runSnapshotHash, 'runSnapshotHash');
  requireSha256(input.evidenceHash, 'evidenceHash');
  requireSha256(input.promotionReviewHash, 'promotionReviewHash');
  requireSha256(input.humanGatePolicyDecision.policyHash, 'humanGatePolicyDecision.policyHash');

  if (input.finalAcceptedReferenceSha !== input.parityReferenceSha) {
    throw new Error('parityReferenceSha must match finalAcceptedReferenceSha');
  }
  if (input.humanGatePolicyDecision.effect !== 'HUMAN_REQUIRED') {
    throw new Error('cutover approval packet requires a HUMAN_REQUIRED human-gate policy decision');
  }

  const humanApprovalRequest = createHumanApprovalRequest({
    policyDecision: input.humanGatePolicyDecision,
    runSnapshotHash: input.runSnapshotHash,
    repository: input.repository,
    revision: input.targetRevision,
    action: 'promote-v3-authority',
    riskTier: 'CRITICAL',
    evidenceHash: input.evidenceHash,
  });

  const identity = {
    schemaVersion: 1,
    action: 'PROMOTE_V3_AUTHORITY',
    repository: input.repository,
    targetRevision: input.targetRevision,
    provisionalReferenceSha: input.provisionalReferenceSha,
    finalAcceptedReferenceSha: input.finalAcceptedReferenceSha,
    parityReferenceSha: input.parityReferenceSha,
    runSnapshotHash: input.runSnapshotHash,
    evidenceHash: input.evidenceHash,
    promotionReviewHash: input.promotionReviewHash,
    humanGatePolicyHash: input.humanGatePolicyDecision.policyHash,
    humanApprovalRequestHash: humanApprovalRequest.requestHash,
  } as const;

  return {
    schemaVersion: 1,
    action: 'PROMOTE_V3_AUTHORITY',
    repository: input.repository,
    targetRevision: input.targetRevision,
    provisionalReferenceSha: input.provisionalReferenceSha,
    finalAcceptedReferenceSha: input.finalAcceptedReferenceSha,
    parityReferenceSha: input.parityReferenceSha,
    runSnapshotHash: input.runSnapshotHash,
    evidenceHash: input.evidenceHash,
    promotionReviewHash: input.promotionReviewHash,
    humanGatePolicyHash: input.humanGatePolicyDecision.policyHash,
    humanApprovalRequest,
    packetHash: sha256(canonicalJson(identity)),
    cutoverApplied: false,
    authorityEnabled: false,
    authority: 'NONE',
  };
}

export function evaluateV3CutoverPacketCurrentness(
  packet: V3CutoverApprovalPacketV1,
  observed: V3CutoverObservedState,
): V3CutoverPacketCurrentness {
  validatePacket(packet);
  const reasons: string[] = [];

  compare(reasons, observed.targetRevision, packet.targetRevision, 'target revision changed');
  compare(
    reasons,
    observed.finalAcceptedReferenceSha,
    packet.finalAcceptedReferenceSha,
    'final accepted reference changed',
  );
  compare(
    reasons,
    observed.parityReferenceSha,
    packet.parityReferenceSha,
    'parity reference changed',
  );
  compare(reasons, observed.runSnapshotHash, packet.runSnapshotHash, 'run snapshot changed');
  compare(reasons, observed.evidenceHash, packet.evidenceHash, 'evidence bundle changed');
  compare(
    reasons,
    observed.promotionReviewHash,
    packet.promotionReviewHash,
    'promotion review changed',
  );
  compare(
    reasons,
    observed.humanGatePolicyHash,
    packet.humanGatePolicyHash,
    'human-gate policy changed',
  );

  reasons.sort();
  return {
    status: reasons.length === 0 ? 'CURRENT' : 'STALE',
    reasons,
    authority: 'NONE',
  };
}

export function evaluateV3CutoverApprovalPreview(
  input: V3CutoverApprovalPreviewInput,
): V3CutoverApprovalPreviewV1 {
  validatePacket(input.packet);
  const currentness = evaluateV3CutoverPacketCurrentness(input.packet, input.observed);
  const systemPolicyCurrent =
    input.systemPolicyDecision.policyHash === input.packet.humanGatePolicyHash;
  const decisionValue = input.humanDecision?.decision ?? 'MISSING';
  const humanDecisionBound =
    input.humanDecision !== null &&
    verifyHumanDecisionBinding(input.packet.humanApprovalRequest, input.humanDecision);
  const humanApprovalVerified =
    currentness.status === 'CURRENT' &&
    systemPolicyCurrent &&
    humanDecisionBound &&
    input.humanDecision?.decision === 'APPROVE';

  const readinessPolicyEffect =
    input.systemPolicyDecision.effect === 'MODEL_QUORUM_REQUIRED'
      ? 'DENY'
      : input.systemPolicyDecision.effect;

  const readiness = evaluateV3CutoverReadiness({
    provisionalReferenceSha: input.packet.provisionalReferenceSha,
    finalAcceptedReferenceSha: input.packet.finalAcceptedReferenceSha,
    parityReferenceSha: input.packet.parityReferenceSha,
    referenceStatus: 'ACCEPTED',
    deltaReviewed: input.deltaReviewed,
    paritySuitePassed: input.paritySuitePassed,
    postPortSmokePassed: input.postPortSmokePassed,
    authorityPromotionReviewed: input.authorityPromotionReviewed,
    humanApprovalVerified,
    policyDecision: readinessPolicyEffect,
    parityStatus: input.parityStatus,
  });

  const reasons = [...currentness.reasons];
  if (!systemPolicyCurrent) reasons.push('system policy hash changed');
  if (input.systemPolicyDecision.effect === 'MODEL_QUORUM_REQUIRED') {
    reasons.push('MODEL_QUORUM_REQUIRED cannot authorize V3 cutover');
  }
  if (input.humanDecision === null) reasons.push('human approval decision is missing');
  else if (!humanDecisionBound) reasons.push('human approval decision binding is invalid');
  else if (input.humanDecision.decision !== 'APPROVE') reasons.push('human approval decision is DENY');
  for (const reason of readiness.reasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  reasons.sort();

  return {
    schemaVersion: 1,
    status: reasons.length === 0 && readiness.status === 'READY' ? 'READY' : 'BLOCKED',
    packetHash: input.packet.packetHash,
    currentness,
    systemPolicyCurrent,
    humanApprovalVerified,
    humanDecision: decisionValue,
    systemPolicyEffect: input.systemPolicyDecision.effect,
    reasons,
    readiness,
    cutoverApplied: false,
    authorityEnabled: false,
    authority: 'NONE',
  };
}

export function recordV3CutoverHumanDecision(
  packet: V3CutoverApprovalPacketV1,
  approverId: string,
  decision: 'APPROVE' | 'DENY',
): HumanDecision {
  validatePacket(packet);
  return recordHumanDecision(packet.humanApprovalRequest, 'HUMAN', approverId, decision);
}

export function cutoverApprovalPacketCanApplyCutover(): false {
  return false;
}

export function cutoverApprovalPreviewCanEnableAuthority(): false {
  return false;
}

export function cutoverApprovalPacketCanUseModelAsHuman(): false {
  return false;
}

function validatePacket(packet: V3CutoverApprovalPacketV1): void {
  if (packet.schemaVersion !== 1 || packet.action !== 'PROMOTE_V3_AUTHORITY') {
    throw new Error('invalid V3 cutover approval packet');
  }
  requireGitSha(packet.targetRevision, 'targetRevision');
  requireGitSha(packet.provisionalReferenceSha, 'provisionalReferenceSha');
  requireGitSha(packet.finalAcceptedReferenceSha, 'finalAcceptedReferenceSha');
  requireGitSha(packet.parityReferenceSha, 'parityReferenceSha');
  requireSha256(packet.runSnapshotHash, 'runSnapshotHash');
  requireSha256(packet.evidenceHash, 'evidenceHash');
  requireSha256(packet.promotionReviewHash, 'promotionReviewHash');
  requireSha256(packet.humanGatePolicyHash, 'humanGatePolicyHash');
  requireSha256(packet.packetHash, 'packetHash');
  if (packet.authority !== 'NONE' || packet.authorityEnabled || packet.cutoverApplied) {
    throw new Error('cutover approval packet cannot carry authority');
  }
}

function compare(reasons: string[], observed: string, expected: string, reason: string): void {
  if (observed !== expected) reasons.push(reason);
}

function requireGitSha(value: string, field: string): void {
  if (!GIT_SHA_PATTERN.test(value)) throw new Error(`${field} must be a 40-character git SHA`);
}

function requireSha256(value: string, field: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`${field} must be lowercase sha256`);
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required`);
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
