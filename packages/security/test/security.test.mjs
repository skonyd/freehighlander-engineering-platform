import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSecuritySnapshot,
  evaluateSecurityReadiness,
  securityCanExecuteProductionMutation,
  securityCanGrantAuthority,
  securityCanWaiveFinding,
  securityClearCanAuthorizeRelease,
  validateSecurityAssessment,
  validateSecurityPlan,
} from '../dist/index.js';

const repository = 'skonyd/freehighlander-engineering-platform';
const revision = '4e00b75aea705b5b089f8467f31774e7ef816d2b';
const policyHash = 'a'.repeat(64);

const plan = {
  schemaVersion: 1,
  id: 'fh-33a-plan',
  repository,
  revision,
  policyHash,
  requiredScanners: [
    { id: 'sast', version: '1.0.0' },
    { id: 'dependency', version: '2.0.0' },
  ],
};

const scannerEvidence = (id, scannerId, scannerVersion, provenance = 'TRUSTED') => ({
  id,
  scannerId,
  scannerVersion,
  repository,
  revision,
  policyHash,
  provenance,
  digest: 'b'.repeat(64),
});

const cleanAssessment = {
  schemaVersion: 1,
  id: 'assessment-1',
  planId: plan.id,
  repository,
  revision,
  policyHash,
  scannerEvidence: [
    scannerEvidence('E-1', 'sast', '1.0.0'),
    scannerEvidence('E-2', 'dependency', '2.0.0'),
  ],
  findings: [],
};

test('security plan requires exact scanner identities and policy hash', () => {
  assert.equal(validateSecurityPlan(plan).valid, true);
});

test('revision, policy and scanner-version mismatch fail closed', () => {
  const wrongRevision = validateSecurityAssessment(plan, {
    ...cleanAssessment,
    revision: 'c'.repeat(40),
  });
  const wrongPolicy = validateSecurityAssessment(plan, {
    ...cleanAssessment,
    policyHash: 'd'.repeat(64),
  });
  const wrongScanner = validateSecurityAssessment(plan, {
    ...cleanAssessment,
    scannerEvidence: [scannerEvidence('E-1', 'sast', '9.9.9')],
  });

  assert.equal(wrongRevision.valid, false);
  assert.match(wrongRevision.errors.join('\n'), /revision must match/);
  assert.equal(wrongPolicy.valid, false);
  assert.match(wrongPolicy.errors.join('\n'), /policyHash must match/);
  assert.equal(wrongScanner.valid, false);
  assert.match(wrongScanner.errors.join('\n'), /version must match/);
});

test('missing trusted required scanner evidence is insufficient', () => {
  const assessment = {
    ...cleanAssessment,
    scannerEvidence: [
      scannerEvidence('E-1', 'sast', '1.0.0'),
      scannerEvidence('E-2', 'dependency', '2.0.0', 'UNTRUSTED'),
    ],
  };

  const readiness = evaluateSecurityReadiness(plan, assessment);
  assert.equal(readiness.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(readiness.releaseAuthorized, false);
});

test('open HIGH or CRITICAL finding blocks readiness', () => {
  const high = {
    ...cleanAssessment,
    findings: [
      {
        id: 'F-1',
        scannerId: 'sast',
        severity: 'HIGH',
        controlId: 'C-001',
        state: 'OPEN',
        evidenceDigest: 'e'.repeat(64),
      },
    ],
  };

  const readiness = evaluateSecurityReadiness(plan, high);
  assert.equal(readiness.status, 'BLOCKED');
  assert.equal(readiness.openHighFindings, 1);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.waiverAuthorized, false);
});

test('remediated finding requires separate remediation evidence', () => {
  const result = validateSecurityAssessment(plan, {
    ...cleanAssessment,
    findings: [
      {
        id: 'F-2',
        scannerId: 'sast',
        severity: 'CRITICAL',
        controlId: 'C-002',
        state: 'REMEDIATED',
        evidenceDigest: 'e'.repeat(64),
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /requires remediation evidence/);
});

test('CLEAR remains evidence only and deterministic', async () => {
  const readiness = evaluateSecurityReadiness(plan, cleanAssessment);
  const first = await buildSecuritySnapshot(plan, cleanAssessment);
  const second = await buildSecuritySnapshot(
    structuredClone(plan),
    structuredClone(cleanAssessment),
  );

  assert.equal(readiness.status, 'CLEAR');
  assert.equal(readiness.authority, 'NONE');
  assert.equal(readiness.mergeAuthorized, false);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.waiverAuthorized, false);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(securityCanGrantAuthority(), false);
  assert.equal(securityCanWaiveFinding(), false);
  assert.equal(securityClearCanAuthorizeRelease(), false);
  assert.equal(securityCanExecuteProductionMutation(), false);
});
