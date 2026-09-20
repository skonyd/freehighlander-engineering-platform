import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRetentionPlan,
  retentionPlanCanDeleteAuditData,
  retentionPlanCanDeleteData,
  validateRetentionRecords,
} from '../dist/index.js';

const now = '2026-09-20T12:00:00.000Z';

const records = [
  {
    id: 'short-expired',
    retentionClass: 'SHORT',
    createdAt: '2026-09-18T12:00:00.000Z',
    expiresAt: '2026-09-19T12:00:00.000Z',
    ownerExists: true,
    auditReferenced: false,
  },
  {
    id: 'audit-old',
    retentionClass: 'AUDIT',
    createdAt: '2025-09-20T12:00:00.000Z',
    expiresAt: '2026-01-01T00:00:00.000Z',
    ownerExists: true,
    auditReferenced: false,
  },
  {
    id: 'project-active',
    retentionClass: 'PROJECT',
    createdAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-10T00:00:00.000Z',
    ownerExists: true,
    auditReferenced: false,
    projectLifecycle: 'ACTIVE',
  },
  {
    id: 'orphan',
    retentionClass: 'EPHEMERAL',
    createdAt: '2026-09-19T00:00:00.000Z',
    expiresAt: '2026-09-19T01:00:00.000Z',
    ownerExists: false,
    auditReferenced: false,
  },
  {
    id: 'audit-protected-short',
    retentionClass: 'SHORT',
    createdAt: '2026-09-18T00:00:00.000Z',
    expiresAt: '2026-09-19T00:00:00.000Z',
    ownerExists: true,
    auditReferenced: true,
  },
];

test('retention plan is deterministic and never grants deletion authority', () => {
  const first = buildRetentionPlan(records, now);
  const second = buildRetentionPlan([...records].reverse(), now);

  assert.deepEqual(first, second);
  assert.equal(first.deletionAuthorized, false);
  assert.equal(first.auditDeletionAuthorized, false);
  assert.equal(retentionPlanCanDeleteData(), false);
  assert.equal(retentionPlanCanDeleteAuditData(), false);
});

test('expired SHORT data becomes purge candidate only', () => {
  const plan = buildRetentionPlan(records, now);
  const decision = plan.decisions.find((item) => item.id === 'short-expired');
  assert.equal(decision?.action, 'PURGE_CANDIDATE');
  assert.equal(decision?.deletionAuthorized, false);
});

test('AUDIT and audit-referenced data stay protected', () => {
  const plan = buildRetentionPlan(records, now);
  assert.equal(plan.decisions.find((item) => item.id === 'audit-old')?.action, 'KEEP');
  assert.equal(
    plan.decisions.find((item) => item.id === 'audit-protected-short')?.action,
    'KEEP',
  );
});

test('active PROJECT data remains retained even after a deadline', () => {
  const plan = buildRetentionPlan(records, now);
  assert.equal(plan.decisions.find((item) => item.id === 'project-active')?.action, 'KEEP');
});

test('orphans require explicit review rather than automatic deletion', () => {
  const plan = buildRetentionPlan(records, now);
  assert.equal(plan.decisions.find((item) => item.id === 'orphan')?.action, 'REVIEW_ORPHAN');
});

test('bounded classes require explicit expiry and malformed timestamps fail closed', () => {
  const missingExpiry = validateRetentionRecords([
    {
      id: 'short-no-expiry',
      retentionClass: 'SHORT',
      createdAt: now,
      ownerExists: true,
      auditReferenced: false,
    },
  ]);
  assert.equal(missingExpiry.valid, false);
  assert.match(missingExpiry.errors.join('\n'), /requires explicit bounded expiresAt/);

  assert.throws(
    () =>
      buildRetentionPlan(
        [
          {
            id: 'bad-time',
            retentionClass: 'EPHEMERAL',
            createdAt: 'not-a-time',
            expiresAt: 'also-not-a-time',
            ownerExists: true,
            auditReferenced: false,
          },
        ],
        now,
      ),
    /invalid retention records/,
  );
});
