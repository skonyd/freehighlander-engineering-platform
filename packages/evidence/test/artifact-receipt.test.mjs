import assert from 'node:assert/strict';
import test from 'node:test';

import {
  artifactReceiptCanGrantAuthority,
  artifactReceiptCanReplaceRequiredRawEvidence,
  buildArtifactReceipt,
  buildPassArtifactCertificate,
  validateArtifactReceipt,
} from '../dist/index.js';

const hash = (character) => character.repeat(64);

test('PASS artifact certificate replaces large successful logs with compact metadata', () => {
  const receipt = buildPassArtifactCertificate({
    artifactId: 'test-output:abc',
    exactRevision: 'a'.repeat(40),
    artifactHash: hash('1'),
    kind: 'TEST_LOG',
    itemCount: 482,
    sourceBytes: 2_000_000,
    estimatedSourceTokens: 450_000,
    durationMs: 83_000,
  });

  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.certificate, 'PASS_CERTIFICATE');
  assert.equal(receipt.failureCount, 0);
  assert.equal(receipt.contextReplacement, 'ALLOWED');
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.authority, 'NONE');
  assert.equal(artifactReceiptCanGrantAuthority(), false);
  assert.doesNotThrow(() => validateArtifactReceipt(receipt));
});

test('required raw evidence may have a receipt but the receipt cannot replace it', () => {
  const receipt = buildPassArtifactCertificate({
    artifactId: 'security-scan:required',
    exactRevision: 'a'.repeat(40),
    artifactHash: hash('2'),
    kind: 'SCANNER_REPORT',
    itemCount: 20,
    sourceBytes: 100_000,
    estimatedSourceTokens: 20_000,
    requiredRawEvidence: true,
  });

  assert.equal(receipt.contextReplacement, 'FORBIDDEN_REQUIRED_RAW_EVIDENCE');
  assert.equal(artifactReceiptCanReplaceRequiredRawEvidence(), false);
});

test('FAIL receipt requires failure evidence references and cannot masquerade as PASS', () => {
  const receipt = buildArtifactReceipt({
    artifactId: 'test-output:failed',
    exactRevision: 'a'.repeat(40),
    artifactHash: hash('3'),
    kind: 'TEST_LOG',
    status: 'FAIL',
    itemCount: 100,
    failureCount: 3,
    sourceBytes: 300_000,
    estimatedSourceTokens: 70_000,
    relevantExcerptHashes: [hash('4'), hash('5')],
  });

  assert.equal(receipt.certificate, 'FAILURE_RECEIPT');
  assert.deepEqual(receipt.relevantExcerptHashes, [hash('4'), hash('5')]);

  assert.throws(
    () =>
      buildArtifactReceipt({
        artifactId: 'bad-fail',
        exactRevision: 'a'.repeat(40),
        artifactHash: hash('3'),
        kind: 'TEST_LOG',
        status: 'FAIL',
        itemCount: 100,
        failureCount: 3,
        sourceBytes: 300_000,
        estimatedSourceTokens: 70_000,
      }),
    /requires at least one relevant excerpt hash/,
  );

  assert.throws(
    () =>
      buildArtifactReceipt({
        artifactId: 'bad-pass',
        exactRevision: 'a'.repeat(40),
        artifactHash: hash('3'),
        kind: 'TEST_LOG',
        status: 'PASS',
        itemCount: 100,
        failureCount: 1,
        sourceBytes: 300_000,
        estimatedSourceTokens: 70_000,
      }),
    /PASS artifact receipt requires failureCount = 0/,
  );
});

test('receipt rejects unknown raw content or secret fields', () => {
  for (const [field, value] of [
    ['rawContent', 'large raw log'],
    ['prompt', 'hidden prompt'],
    ['secretValue', 'secret'],
  ]) {
    assert.throws(
      () =>
        buildArtifactReceipt({
          artifactId: 'tool-output',
          exactRevision: 'a'.repeat(40),
          artifactHash: hash('6'),
          kind: 'TOOL_OUTPUT',
          status: 'PARTIAL',
          itemCount: 1,
          failureCount: 0,
          sourceBytes: 10,
          estimatedSourceTokens: 5,
          [field]: value,
        }),
      /input field is not allowed/,
    );
  }
});

test('receipt token and count accounting fails closed', () => {
  assert.throws(
    () =>
      buildArtifactReceipt({
        artifactId: 'bad-count',
        exactRevision: 'a'.repeat(40),
        artifactHash: hash('6'),
        kind: 'CI_LOG',
        status: 'FAIL',
        itemCount: 1,
        failureCount: 2,
        sourceBytes: 10,
        estimatedSourceTokens: 5,
        relevantExcerptHashes: [hash('7')],
      }),
    /failureCount cannot exceed itemCount/,
  );

  assert.throws(
    () =>
      buildArtifactReceipt({
        artifactId: 'bad-tokens',
        exactRevision: 'a'.repeat(40),
        artifactHash: hash('6'),
        kind: 'CI_LOG',
        status: 'PARTIAL',
        itemCount: 1,
        failureCount: 0,
        sourceBytes: 10,
        estimatedSourceTokens: -1,
      }),
    /estimatedSourceTokens must be a non-negative integer/,
  );
});

test('tampered derived state or receipt hash is rejected', () => {
  const receipt = buildPassArtifactCertificate({
    artifactId: 'ci-output',
    exactRevision: 'a'.repeat(40),
    artifactHash: hash('8'),
    kind: 'CI_LOG',
    itemCount: 10,
    sourceBytes: 1000,
    estimatedSourceTokens: 200,
  });

  assert.throws(
    () =>
      validateArtifactReceipt({
        ...receipt,
        contextReplacement: 'FORBIDDEN_REQUIRED_RAW_EVIDENCE',
      }),
    /derived state mismatch/,
  );
  assert.throws(
    () => validateArtifactReceipt({ ...receipt, receiptHash: hash('0') }),
    /hash mismatch/,
  );
});
