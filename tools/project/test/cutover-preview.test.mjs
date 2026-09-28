import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildV3CutoverApprovalPacket,
  recordV3CutoverHumanDecision,
} from '../../../packages/governance/dist/index.js';
import {
  cutoverPreviewCliCanApplyCutover,
  cutoverPreviewCliCanCreateHumanApproval,
  cutoverPreviewHelp,
  executeCutoverPreviewDocument,
  parseCutoverPreviewArgs,
  readCutoverPreviewDocument,
  runCutoverPreviewCommand,
} from '../lib/cutover-preview.mjs';

const sha40 = (character) => character.repeat(40);
const sha64 = (character) => character.repeat(64);

function packetInput() {
  return {
    repository: 'skonyd/freehighlander-engineering-platform',
    targetRevision: sha40('1'),
    provisionalReferenceSha: sha40('2'),
    finalAcceptedReferenceSha: sha40('3'),
    parityReferenceSha: sha40('3'),
    runSnapshotHash: sha64('4'),
    evidenceHash: sha64('5'),
    promotionReviewHash: sha64('6'),
    humanGatePolicyDecision: {
      effect: 'HUMAN_REQUIRED',
      matchedRuleIds: ['v3-cutover-human'],
      policyHash: sha64('a'),
      reason: 'exact human approval required',
    },
  };
}

function previewDocument(overrides = {}) {
  const packet = buildV3CutoverApprovalPacket(packetInput());
  return {
    packet,
    observed: {
      targetRevision: packet.targetRevision,
      finalAcceptedReferenceSha: packet.finalAcceptedReferenceSha,
      parityReferenceSha: packet.parityReferenceSha,
      runSnapshotHash: packet.runSnapshotHash,
      evidenceHash: packet.evidenceHash,
      promotionReviewHash: packet.promotionReviewHash,
      humanGatePolicyHash: packet.humanGatePolicyHash,
    },
    humanDecision: recordV3CutoverHumanDecision(packet, 'human-owner', 'APPROVE'),
    systemPolicyDecision: {
      effect: 'ALLOW',
      matchedRuleIds: ['v3-cutover-allow'],
      policyHash: packet.humanGatePolicyHash,
      reason: 'canonical control-plane policy allows current exact cutover scope',
    },
    deltaReviewed: true,
    paritySuitePassed: true,
    postPortSmokePassed: true,
    authorityPromotionReviewed: true,
    parityStatus: 'PASS',
    ...overrides,
  };
}

test('argument parser exposes only packet preview and help commands', () => {
  assert.deepEqual(parseCutoverPreviewArgs([]), { command: 'help', inputPath: null });
  assert.deepEqual(parseCutoverPreviewArgs(['help']), { command: 'help', inputPath: null });
  assert.deepEqual(parseCutoverPreviewArgs(['packet', '--input', 'packet.json']), {
    command: 'packet',
    inputPath: 'packet.json',
  });
  assert.deepEqual(parseCutoverPreviewArgs(['preview', '--input', 'preview.json']), {
    command: 'preview',
    inputPath: 'preview.json',
  });

  assert.throws(() => parseCutoverPreviewArgs(['approve', '--input', 'x.json']), /unknown/);
  assert.throws(() => parseCutoverPreviewArgs(['packet']), /--input is required/);
  assert.throws(
    () => parseCutoverPreviewArgs(['packet', '--input', 'one.json', '--input', 'two.json']),
    /only once/,
  );
  assert.throws(
    () => parseCutoverPreviewArgs(['packet', '--unexpected']),
    /unknown cutover preview option/,
  );
});

test('packet mode builds exact request but cannot approve or apply cutover', () => {
  const result = executeCutoverPreviewDocument('packet', packetInput());

  assert.equal(result.mode, 'PACKET');
  assert.equal(result.packet.action, 'PROMOTE_V3_AUTHORITY');
  assert.equal(result.packet.humanApprovalRequest.action, 'promote-v3-authority');
  assert.equal(result.packet.humanApprovalRequest.riskTier, 'CRITICAL');
  assert.equal(
    result.humanApprovalRequest.requestHash,
    result.packet.humanApprovalRequest.requestHash,
  );
  assert.equal(result.cutoverApplied, false);
  assert.equal(result.authorityEnabled, false);
  assert.equal(result.authority, 'NONE');
});

test('preview consumes an explicit existing human decision and remains read-only', () => {
  const result = executeCutoverPreviewDocument('preview', previewDocument());

  assert.equal(result.mode, 'PREVIEW');
  assert.equal(result.preview.status, 'READY');
  assert.equal(result.preview.humanApprovalVerified, true);
  assert.equal(result.preview.systemPolicyEffect, 'ALLOW');
  assert.equal(result.preview.cutoverApplied, false);
  assert.equal(result.preview.authorityEnabled, false);
  assert.equal(result.cutoverApplied, false);
  assert.equal(result.authorityEnabled, false);
});

test('preview requires humanDecision field explicitly and never invents approval', () => {
  const document = previewDocument();
  delete document.humanDecision;

  assert.throws(
    () => executeCutoverPreviewDocument('preview', document),
    /must explicitly include humanDecision/,
  );

  const missing = executeCutoverPreviewDocument('preview', {
    ...previewDocument(),
    humanDecision: null,
  });
  assert.equal(missing.preview.status, 'BLOCKED');
  assert.equal(missing.preview.humanDecision, 'MISSING');
  assert.equal(missing.preview.humanApprovalVerified, false);
});

test('preview validates readiness flags and parity status before governance evaluation', () => {
  assert.throws(
    () =>
      executeCutoverPreviewDocument('preview', {
        ...previewDocument(),
        deltaReviewed: 'yes',
      }),
    /deltaReviewed must be boolean/,
  );
  assert.throws(
    () =>
      executeCutoverPreviewDocument('preview', {
        ...previewDocument(),
        parityStatus: 'UNKNOWN',
      }),
    /parityStatus is invalid/,
  );
  assert.throws(
    () =>
      executeCutoverPreviewDocument('preview', {
        ...previewDocument(),
        systemPolicyDecision: null,
      }),
    /systemPolicyDecision must be an object/,
  );
});

test('JSON reader is deterministic and rejects missing malformed or non-object input', () => {
  const files = new Map([
    ['/virtual/good.json', JSON.stringify(packetInput())],
    ['/virtual/array.json', '[]'],
    ['/virtual/bad.json', '{'],
  ]);
  const options = {
    resolvePath: (value) => '/virtual/' + value,
    readText: (filePath) => {
      if (!files.has(filePath)) throw new Error('ENOENT');
      return files.get(filePath);
    },
  };

  const good = readCutoverPreviewDocument('good.json', options);
  assert.equal(good.resolvedPath, '/virtual/good.json');
  assert.equal(good.document.repository, packetInput().repository);

  assert.throws(
    () => readCutoverPreviewDocument('missing.json', options),
    /unable to read cutover preview input: ENOENT/,
  );
  assert.throws(
    () => readCutoverPreviewDocument('bad.json', options),
    /invalid cutover preview JSON/,
  );
  assert.throws(
    () => readCutoverPreviewDocument('array.json', options),
    /root JSON value must be an object/,
  );
});

test('run command reports resolved input path and help is explicitly non-authoritative', () => {
  const packetResult = runCutoverPreviewCommand(['packet', '--input', 'packet.json'], {
    resolvePath: (value) => '/virtual/' + value,
    readText: () => JSON.stringify(packetInput()),
  });
  assert.equal(packetResult.inputPath, '/virtual/packet.json');
  assert.equal(packetResult.mode, 'PACKET');

  const help = runCutoverPreviewCommand(['help']);
  assert.deepEqual(help.forbiddenCommands, ['approve', 'apply', 'enable']);
  assert.equal(help.authority, 'NONE');
  assert.equal(cutoverPreviewHelp().mode, 'HELP');
});

test('CLI has no human-approval creation or cutover authority', () => {
  assert.equal(cutoverPreviewCliCanCreateHumanApproval(), false);
  assert.equal(cutoverPreviewCliCanApplyCutover(), false);
});
