import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildV3CutoverApprovalPacket,
  cutoverApprovalPacketCanApplyCutover,
  cutoverApprovalPacketCanUseModelAsHuman,
  cutoverApprovalPreviewCanEnableAuthority,
  evaluateV3CutoverApprovalPreview,
  evaluateV3CutoverPacketCurrentness,
  recordV3CutoverHumanDecision,
} from '../dist/index.js';

const sha40 = (character) => character.repeat(40);
const sha64 = (character) => character.repeat(64);

const humanGatePolicyDecision = {
  effect: 'HUMAN_REQUIRED',
  matchedRuleIds: ['v3-cutover-human'],
  policyHash: sha64('a'),
  reason: 'exact human approval required',
};

function packetInput(overrides = {}) {
  return {
    repository: 'skonyd/freehighlander-engineering-platform',
    targetRevision: sha40('1'),
    provisionalReferenceSha: sha40('2'),
    finalAcceptedReferenceSha: sha40('3'),
    parityReferenceSha: sha40('3'),
    runSnapshotHash: sha64('4'),
    evidenceHash: sha64('5'),
    promotionReviewHash: sha64('6'),
    humanGatePolicyDecision,
    ...overrides,
  };
}

function observed(packet, overrides = {}) {
  return {
    targetRevision: packet.targetRevision,
    finalAcceptedReferenceSha: packet.finalAcceptedReferenceSha,
    parityReferenceSha: packet.parityReferenceSha,
    runSnapshotHash: packet.runSnapshotHash,
    evidenceHash: packet.evidenceHash,
    promotionReviewHash: packet.promotionReviewHash,
    humanGatePolicyHash: packet.humanGatePolicyHash,
    ...overrides,
  };
}

function previewInput(packet, overrides = {}) {
  return {
    packet,
    observed: observed(packet),
    humanDecision: recordV3CutoverHumanDecision(packet, 'human-owner', 'APPROVE'),
    systemPolicyDecision: {
      effect: 'ALLOW',
      matchedRuleIds: ['v3-cutover-allow'],
      policyHash: packet.humanGatePolicyHash,
      reason: 'all exact cutover prerequisites satisfied',
    },
    deltaReviewed: true,
    paritySuitePassed: true,
    postPortSmokePassed: true,
    authorityPromotionReviewed: true,
    parityStatus: 'PASS',
    ...overrides,
  };
}

test('cutover approval packet is deterministic exact-bound and authority-neutral', () => {
  const first = buildV3CutoverApprovalPacket(packetInput());
  const second = buildV3CutoverApprovalPacket(packetInput());

  assert.equal(first.packetHash, second.packetHash);
  assert.equal(first.humanApprovalRequest.requestHash, second.humanApprovalRequest.requestHash);
  assert.equal(first.humanApprovalRequest.action, 'promote-v3-authority');
  assert.equal(first.humanApprovalRequest.riskTier, 'CRITICAL');
  assert.equal(first.authority, 'NONE');
  assert.equal(first.authorityEnabled, false);
  assert.equal(first.cutoverApplied, false);
});

test('packet construction rejects mismatched parity reference and non-human gate policy', () => {
  assert.throws(
    () =>
      buildV3CutoverApprovalPacket(
        packetInput({
          parityReferenceSha: sha40('7'),
        }),
      ),
    /must match finalAcceptedReferenceSha/,
  );

  assert.throws(
    () =>
      buildV3CutoverApprovalPacket(
        packetInput({
          humanGatePolicyDecision: {
            ...humanGatePolicyDecision,
            effect: 'ALLOW',
          },
        }),
      ),
    /requires a HUMAN_REQUIRED/,
  );
});

test('currentness is exact and reports every stale cutover binding', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());
  assert.deepEqual(evaluateV3CutoverPacketCurrentness(packet, observed(packet)), {
    status: 'CURRENT',
    reasons: [],
    authority: 'NONE',
  });

  const stale = evaluateV3CutoverPacketCurrentness(
    packet,
    observed(packet, {
      targetRevision: sha40('8'),
      evidenceHash: sha64('9'),
      promotionReviewHash: sha64('b'),
    }),
  );

  assert.equal(stale.status, 'STALE');
  assert.deepEqual(stale.reasons, [
    'evidence bundle changed',
    'promotion review changed',
    'target revision changed',
  ]);
});

test('valid human approval plus current SYSTEM_POLICY ALLOW yields READY preview without authority', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());
  const preview = evaluateV3CutoverApprovalPreview(previewInput(packet));

  assert.equal(preview.status, 'READY');
  assert.equal(preview.currentness.status, 'CURRENT');
  assert.equal(preview.systemPolicyCurrent, true);
  assert.equal(preview.humanApprovalVerified, true);
  assert.equal(preview.humanDecision, 'APPROVE');
  assert.equal(preview.systemPolicyEffect, 'ALLOW');
  assert.equal(preview.readiness.status, 'READY');
  assert.equal(preview.readiness.cutoverMayBeApplied, true);
  assert.equal(preview.readiness.authorityEnabled, false);
  assert.equal(preview.cutoverApplied, false);
  assert.equal(preview.authorityEnabled, false);
  assert.equal(preview.authority, 'NONE');
});

test('stale evidence or changed policy invalidates a previously valid human approval', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());

  const stale = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      observed: observed(packet, { evidenceHash: sha64('c') }),
    }),
  );
  assert.equal(stale.status, 'BLOCKED');
  assert.equal(stale.humanApprovalVerified, false);
  assert.equal(stale.reasons.includes('evidence bundle changed'), true);

  const changedPolicy = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      systemPolicyDecision: {
        effect: 'ALLOW',
        matchedRuleIds: ['changed-policy'],
        policyHash: sha64('d'),
        reason: 'different policy snapshot',
      },
    }),
  );
  assert.equal(changedPolicy.status, 'BLOCKED');
  assert.equal(changedPolicy.systemPolicyCurrent, false);
  assert.equal(changedPolicy.humanApprovalVerified, false);
  assert.equal(changedPolicy.reasons.includes('system policy hash changed'), true);
});

test('missing invalid or denied human decisions block cutover preview', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());

  const missing = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      humanDecision: null,
    }),
  );
  assert.equal(missing.status, 'BLOCKED');
  assert.equal(missing.humanDecision, 'MISSING');
  assert.equal(missing.reasons.includes('human approval decision is missing'), true);

  const denied = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      humanDecision: recordV3CutoverHumanDecision(packet, 'human-owner', 'DENY'),
    }),
  );
  assert.equal(denied.status, 'BLOCKED');
  assert.equal(denied.humanDecision, 'DENY');
  assert.equal(denied.reasons.includes('human approval decision is DENY'), true);

  const invalid = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      humanDecision: {
        ...recordV3CutoverHumanDecision(packet, 'human-owner', 'APPROVE'),
        decisionHash: sha64('e'),
      },
    }),
  );
  assert.equal(invalid.status, 'BLOCKED');
  assert.equal(invalid.reasons.includes('human approval decision binding is invalid'), true);
});

test('model quorum policy cannot authorize V3 cutover', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());
  const preview = evaluateV3CutoverApprovalPreview(
    previewInput(packet, {
      systemPolicyDecision: {
        effect: 'MODEL_QUORUM_REQUIRED',
        matchedRuleIds: ['model-quorum'],
        policyHash: packet.humanGatePolicyHash,
        reason: 'models cannot replace the cutover human gate',
      },
    }),
  );

  assert.equal(preview.status, 'BLOCKED');
  assert.equal(preview.systemPolicyEffect, 'MODEL_QUORUM_REQUIRED');
  assert.equal(
    preview.reasons.includes('MODEL_QUORUM_REQUIRED cannot authorize V3 cutover'),
    true,
  );
});

test('tampered embedded request or packet hash fails closed', () => {
  const packet = buildV3CutoverApprovalPacket(packetInput());

  assert.throws(
    () =>
      evaluateV3CutoverPacketCurrentness(
        {
          ...packet,
          humanApprovalRequest: {
            ...packet.humanApprovalRequest,
            revision: sha40('f'),
          },
        },
        observed(packet),
      ),
    /human request binding mismatch/,
  );

  assert.throws(
    () =>
      evaluateV3CutoverPacketCurrentness(
        {
          ...packet,
          packetHash: sha64('f'),
        },
        observed(packet),
      ),
    /packet hash mismatch/,
  );
});

test('cutover approval packet and preview cannot grant or apply authority', () => {
  assert.equal(cutoverApprovalPacketCanApplyCutover(), false);
  assert.equal(cutoverApprovalPreviewCanEnableAuthority(), false);
  assert.equal(cutoverApprovalPacketCanUseModelAsHuman(), false);
});
