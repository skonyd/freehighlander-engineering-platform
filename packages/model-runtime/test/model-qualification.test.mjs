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
  recordShadowVerification,
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
