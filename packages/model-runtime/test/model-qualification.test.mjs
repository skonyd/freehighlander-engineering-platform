import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDiscoveredQualification,
  grantModelEligibility,
  markQualificationDeprecated,
  markQualificationUnavailable,
  modelQualificationCanGrantAuthority,
  qualificationAllowsBinding,
  recordCapabilityProbe,
  recordRegressionVerification,
  recordShadowVerification,
  validateModelQualificationSnapshotV1,
} from '../dist/index.js';

const CATALOG_HASH = 'a'.repeat(64);
const PROBE_HASH = 'b'.repeat(64);
const SHADOW_HASH = 'c'.repeat(64);
const DECISION_HASH = 'd'.repeat(64);

function discovered() {
  return createDiscoveredQualification({
    providerId: 'provider-a',
    modelId: 'model-a',
    catalogHash: CATALOG_HASH,
  });
}

test('qualification lifecycle is explicit hash-bound and authority-neutral', () => {
  const initial = discovered();
  assert.equal(initial.stage, 'DISCOVERED');
  assert.equal(initial.authority, 'NONE');

  const probed = recordCapabilityProbe(initial, {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  assert.equal(probed.stage, 'PROBED');

  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T18:05:00.000Z',
    role: 'final-review',
    riskTier: 'HIGH',
  });
  assert.equal(shadow.stage, 'SHADOW_VERIFIED');

  const eligible = grantModelEligibility(shadow, {
    role: 'final-review',
    riskTier: 'HIGH',
    grantedAt: '2026-09-24T18:10:00.000Z',
    decisionHash: DECISION_HASH,
  });
  assert.equal(eligible.stage, 'ELIGIBLE');
  assert.equal(qualificationAllowsBinding(eligible, 'final-review', 'HIGH'), true);
  assert.equal(qualificationAllowsBinding(eligible, 'controller', 'HIGH'), false);
  assert.equal(modelQualificationCanGrantAuthority(), false);
});

test('failed probe and shadow verification cannot advance eligibility', () => {
  const failedProbe = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'FAIL',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  assert.equal(failedProbe.stage, 'DISCOVERED');

  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  const failedShadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'FAIL',
    verifiedAt: '2026-09-24T18:05:00.000Z',
    role: 'test-review',
    riskTier: 'NORMAL',
  });
  assert.equal(failedShadow.stage, 'PROBED');
  assert.throws(
    () =>
      grantModelEligibility(failedShadow, {
        role: 'test-review',
        riskTier: 'NORMAL',
        grantedAt: '2026-09-24T18:10:00.000Z',
        decisionHash: DECISION_HASH,
      }),
    /cannot grant eligibility/,
  );
});

test('qualification transitions reject skipped stages and role-risk mismatch', () => {
  const initial = discovered();

  assert.throws(
    () =>
      recordShadowVerification(initial, {
        evidenceHash: SHADOW_HASH,
        status: 'PASS',
        verifiedAt: '2026-09-24T18:05:00.000Z',
        role: 'controller',
        riskTier: 'NORMAL',
      }),
    /cannot record shadow verification/,
  );

  const probed = recordCapabilityProbe(initial, {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T18:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });

  assert.throws(
    () =>
      grantModelEligibility(shadow, {
        role: 'final-review',
        riskTier: 'HIGH',
        grantedAt: '2026-09-24T18:10:00.000Z',
        decisionHash: DECISION_HASH,
      }),
    /role\/risk must match/,
  );
});

test('deprecated and unavailable qualification states preserve evidence but are not bindable', () => {
  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T18:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });
  const eligible = grantModelEligibility(shadow, {
    role: 'controller',
    riskTier: 'NORMAL',
    grantedAt: '2026-09-24T18:10:00.000Z',
    decisionHash: DECISION_HASH,
  });

  const deprecated = markQualificationDeprecated(eligible);
  const unavailable = markQualificationUnavailable(eligible);

  assert.equal(deprecated.stage, 'DEPRECATED');
  assert.equal(unavailable.stage, 'UNAVAILABLE');
  assert.equal(deprecated.shadow.evidenceHash, SHADOW_HASH);
  assert.equal(unavailable.eligibility.decisionHash, DECISION_HASH);
  assert.equal(qualificationAllowsBinding(deprecated, 'controller', 'NORMAL'), false);
  assert.equal(qualificationAllowsBinding(unavailable, 'controller', 'NORMAL'), false);
});

test('qualification snapshot tampering and malformed hashes fail closed', () => {
  assert.throws(
    () =>
      createDiscoveredQualification({
        providerId: 'provider-a',
        modelId: 'model-a',
        catalogHash: 'bad',
      }),
    /catalogHash/,
  );

  const initial = discovered();
  const tampered = { ...initial, modelId: 'model-b' };

  assert.throws(
    () =>
      recordCapabilityProbe(tampered, {
        evidenceHash: PROBE_HASH,
        status: 'PASS',
        probedAt: '2026-09-24T18:00:00.000Z',
      }),
    /hash mismatch/,
  );
});

test('required regression corpus blocks eligibility until exact PASS evidence exists', () => {
  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T19:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T19:05:00.000Z',
    role: 'final-review',
    riskTier: 'HIGH',
  });
  const corpusHash = 'e'.repeat(64);

  assert.throws(
    () =>
      grantModelEligibility(shadow, {
        role: 'final-review',
        riskTier: 'HIGH',
        grantedAt: '2026-09-24T19:10:00.000Z',
        decisionHash: DECISION_HASH,
        requiredRegressionCorpusHash: corpusHash,
      }),
    /requires passing regression verification/,
  );

  const failed = recordRegressionVerification(shadow, {
    corpusHash,
    reportHash: 'f'.repeat(64),
    status: 'FAIL',
    verifiedAt: '2026-09-24T19:07:00.000Z',
  });
  assert.equal(failed.stage, 'SHADOW_VERIFIED');
  assert.equal(failed.regression.status, 'FAIL');

  assert.throws(
    () =>
      grantModelEligibility(failed, {
        role: 'final-review',
        riskTier: 'HIGH',
        grantedAt: '2026-09-24T19:10:00.000Z',
        decisionHash: DECISION_HASH,
        requiredRegressionCorpusHash: corpusHash,
      }),
    /requires passing regression verification/,
  );

  const passed = recordRegressionVerification(shadow, {
    corpusHash,
    reportHash: '1'.repeat(64),
    status: 'PASS',
    verifiedAt: '2026-09-24T19:08:00+00:00',
  });
  assert.equal(passed.regression.verifiedAt, '2026-09-24T19:08:00.000Z');

  assert.throws(
    () =>
      grantModelEligibility(passed, {
        role: 'final-review',
        riskTier: 'HIGH',
        grantedAt: '2026-09-24T19:10:00.000Z',
        decisionHash: DECISION_HASH,
        requiredRegressionCorpusHash: '2'.repeat(64),
      }),
    /regression corpus hash mismatch/,
  );

  const eligible = grantModelEligibility(passed, {
    role: 'final-review',
    riskTier: 'HIGH',
    grantedAt: '2026-09-24T19:10:00.000Z',
    decisionHash: DECISION_HASH,
    requiredRegressionCorpusHash: corpusHash,
  });
  assert.equal(eligible.stage, 'ELIGIBLE');
  assert.equal(eligible.regression.corpusHash, corpusHash);
  assert.equal(eligible.regression.status, 'PASS');
  assert.equal(eligible.eligibility.requiredRegressionCorpusHash, corpusHash);
});

test('regression verification is only valid after passing shadow verification', () => {
  assert.throws(
    () =>
      recordRegressionVerification(discovered(), {
        corpusHash: 'e'.repeat(64),
        reportHash: 'f'.repeat(64),
        status: 'PASS',
        verifiedAt: '2026-09-24T19:08:00.000Z',
      }),
    /cannot record regression verification/,
  );

  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T19:00:00.000Z',
  });
  const failedShadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'FAIL',
    verifiedAt: '2026-09-24T19:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });

  assert.throws(
    () =>
      recordRegressionVerification(failedShadow, {
        corpusHash: 'e'.repeat(64),
        reportHash: 'f'.repeat(64),
        status: 'PASS',
        verifiedAt: '2026-09-24T19:08:00.000Z',
      }),
    /cannot record regression verification/,
  );
});

test('regression evidence hashes and timestamps fail closed and survive terminal states', () => {
  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T19:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T19:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });

  assert.throws(
    () =>
      recordRegressionVerification(shadow, {
        corpusHash: 'bad',
        reportHash: 'f'.repeat(64),
        status: 'PASS',
        verifiedAt: '2026-09-24T19:08:00.000Z',
      }),
    /regression corpusHash/,
  );
  assert.throws(
    () =>
      recordRegressionVerification(shadow, {
        corpusHash: 'e'.repeat(64),
        reportHash: 'bad',
        status: 'PASS',
        verifiedAt: '2026-09-24T19:08:00.000Z',
      }),
    /regression reportHash/,
  );
  assert.throws(
    () =>
      recordRegressionVerification(shadow, {
        corpusHash: 'e'.repeat(64),
        reportHash: 'f'.repeat(64),
        status: 'PASS',
        verifiedAt: 'not-a-date',
      }),
    /ISO timestamp/,
  );

  const verified = recordRegressionVerification(shadow, {
    corpusHash: 'e'.repeat(64),
    reportHash: 'f'.repeat(64),
    status: 'PASS',
    verifiedAt: '2026-09-24T19:08:00.000Z',
  });
  const eligible = grantModelEligibility(verified, {
    role: 'controller',
    riskTier: 'NORMAL',
    grantedAt: '2026-09-24T19:10:00.000Z',
    decisionHash: DECISION_HASH,
    requiredRegressionCorpusHash: 'e'.repeat(64),
  });

  assert.equal(markQualificationDeprecated(eligible).regression.reportHash, 'f'.repeat(64));
  assert.equal(markQualificationUnavailable(eligible).regression.reportHash, 'f'.repeat(64));
});

test('eligibility remains backward compatible when no regression corpus is required', () => {
  const probed = recordCapabilityProbe(discovered(), {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T19:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T19:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });
  const eligible = grantModelEligibility(shadow, {
    role: 'controller',
    riskTier: 'NORMAL',
    grantedAt: '2026-09-24T19:10:00.000Z',
    decisionHash: DECISION_HASH,
  });
  assert.equal(eligible.stage, 'ELIGIBLE');
  assert.equal(eligible.regression, undefined);
});

test('persisted qualification snapshot validation accepts canonical state and rejects tamper', () => {
  const initial = discovered();
  const probed = recordCapabilityProbe(initial, {
    evidenceHash: PROBE_HASH,
    status: 'PASS',
    probedAt: '2026-09-24T18:00:00.000Z',
  });
  const shadow = recordShadowVerification(probed, {
    evidenceHash: SHADOW_HASH,
    status: 'PASS',
    verifiedAt: '2026-09-24T18:05:00.000Z',
    role: 'controller',
    riskTier: 'NORMAL',
  });
  const eligible = grantModelEligibility(shadow, {
    role: 'controller',
    riskTier: 'NORMAL',
    grantedAt: '2026-09-24T18:10:00.000Z',
    decisionHash: DECISION_HASH,
  });

  assert.doesNotThrow(() => validateModelQualificationSnapshotV1(eligible));
  assert.throws(
    () => validateModelQualificationSnapshotV1({ ...eligible, hash: 'f'.repeat(64) }),
    /hash mismatch/,
  );
});
