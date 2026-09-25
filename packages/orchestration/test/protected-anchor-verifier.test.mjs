import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProtectedContextAnchors,
  protectedAnchorVerifierCanGrantAuthority,
  tokenEconomyCanInvokeRemoteWithMissingProtectedAnchor,
  validateProtectedAnchorVerification,
  verifyProtectedContextAnchors,
} from '../dist/index.js';

const source = `
REVISION=0123456789abcdef0123456789abcdef01234567
SCOPE_HASH=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ERROR_CODE=USER_CREATE_FAILED
FILE=packages/orchestration/src/context-economy.ts
SYMBOL=evaluateContextReduction
`;

test('all exact protected anchors preserved allows the optimized packet to proceed', () => {
  const optimized = `
REVISION=0123456789abcdef0123456789abcdef01234567
SCOPE_HASH=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ERROR_CODE=USER_CREATE_FAILED
FILE=packages/orchestration/src/context-economy.ts
SYMBOL=evaluateContextReduction
compact supporting text
`;

  const verification = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: optimized,
    anchors: [
      {
        id: 'revision',
        value: '0123456789abcdef0123456789abcdef01234567',
      },
      {
        id: 'scope',
        value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      { id: 'error-code', value: 'USER_CREATE_FAILED' },
      {
        id: 'file',
        value: 'packages/orchestration/src/context-economy.ts',
      },
      { id: 'symbol', value: 'evaluateContextReduction' },
    ],
  });

  assert.equal(verification.status, 'PASS');
  assert.equal(verification.remoteInvocationAllowed, true);
  assert.deepEqual(verification.missingSourceAnchorIds, []);
  assert.deepEqual(verification.missingOptimizedAnchorIds, []);
  assert.match(verification.verificationHash, /^[a-f0-9]{64}$/);
  assert.equal(verification.authority, 'NONE');
  assert.equal(protectedAnchorVerifierCanGrantAuthority(), false);
  assert.equal(tokenEconomyCanInvokeRemoteWithMissingProtectedAnchor(), false);
  assert.doesNotThrow(() => assertProtectedContextAnchors(verification));
  assert.doesNotThrow(() => validateProtectedAnchorVerification(verification));
});

test('missing or altered protected anchor blocks remote invocation before the call', () => {
  const verification = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: source.replace('USER_CREATE_FAILED', 'USER_FAILED'),
    anchors: [{ id: 'error-code', value: 'USER_CREATE_FAILED' }],
  });

  assert.equal(verification.status, 'FAIL');
  assert.equal(verification.remoteInvocationAllowed, false);
  assert.deepEqual(verification.missingOptimizedAnchorIds, ['error-code']);
  assert.throws(
    () => assertProtectedContextAnchors(verification),
    /optimized:error-code/,
  );
});

test('anchor absent from source is an invalid optimization baseline and fails closed', () => {
  const verification = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: source,
    anchors: [{ id: 'missing-source', value: 'NOT_PRESENT_ANYWHERE' }],
  });

  assert.equal(verification.status, 'FAIL');
  assert.equal(verification.remoteInvocationAllowed, false);
  assert.deepEqual(verification.missingSourceAnchorIds, ['missing-source']);
});

test('minimum occurrence contract preserves repeated required identifiers when configured', () => {
  const repeatedSource = 'CONTROL=C-0013\nCONTROL=C-0013\n';
  const reduced = 'CONTROL=C-0013\n';

  const verification = verifyProtectedContextAnchors({
    sourceText: repeatedSource,
    optimizedText: reduced,
    anchors: [{ id: 'control-id', value: 'C-0013', minimumOccurrences: 2 }],
  });

  assert.equal(verification.status, 'FAIL');
  assert.equal(verification.checks[0].sourceOccurrences, 2);
  assert.equal(verification.checks[0].optimizedOccurrences, 1);
  assert.equal(verification.remoteInvocationAllowed, false);
});

test('anchor order does not change the anchor-set identity', () => {
  const anchors = [
    { id: 'revision', value: '0123456789abcdef0123456789abcdef01234567' },
    {
      id: 'scope',
      value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  ];
  const first = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: source,
    anchors,
  });
  const second = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: source,
    anchors: [...anchors].reverse(),
  });

  assert.equal(first.anchorSetHash, second.anchorSetHash);
  assert.equal(first.verificationHash, second.verificationHash);
});

test('duplicate ids empty anchors and invalid minimum occurrence fail closed', () => {
  assert.throws(
    () =>
      verifyProtectedContextAnchors({
        sourceText: source,
        optimizedText: source,
        anchors: [],
      }),
    /requires at least one anchor/,
  );

  assert.throws(
    () =>
      verifyProtectedContextAnchors({
        sourceText: source,
        optimizedText: source,
        anchors: [
          { id: 'same', value: 'USER_CREATE_FAILED' },
          { id: 'same', value: 'evaluateContextReduction' },
        ],
      }),
    /duplicate protected anchor id/,
  );

  assert.throws(
    () =>
      verifyProtectedContextAnchors({
        sourceText: source,
        optimizedText: source,
        anchors: [
          {
            id: 'bad-count',
            value: 'USER_CREATE_FAILED',
            minimumOccurrences: 0,
          },
        ],
      }),
    /minimumOccurrences must be >= 1/,
  );
});

test('tampered verification identity is rejected', () => {
  const verification = verifyProtectedContextAnchors({
    sourceText: source,
    optimizedText: source,
    anchors: [{ id: 'error-code', value: 'USER_CREATE_FAILED' }],
  });

  assert.throws(
    () =>
      validateProtectedAnchorVerification({
        ...verification,
        verificationHash: '0'.repeat(64),
      }),
    /hash mismatch/,
  );

  assert.throws(
    () =>
      validateProtectedAnchorVerification({
        ...verification,
        remoteInvocationAllowed: false,
      }),
    /remote invocation decision mismatch/,
  );
});
