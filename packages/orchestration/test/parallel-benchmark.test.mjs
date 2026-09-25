import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParallelBenchmarkReport,
  parallelBenchmarkCanGrantAuthority,
  representativeParallelBenchmarkFixtures,
} from '../dist/index.js';

test('representative NORMAL and HIGH fixtures compare serial and parallel wall clock deterministically', () => {
  const report = buildParallelBenchmarkReport(representativeParallelBenchmarkFixtures());

  assert.equal(report.methodology, 'REPRESENTATIVE_DETERMINISTIC_FIXTURE');
  assert.equal(report.authority, 'NONE');
  assert.deepEqual(
    report.samples.map((sample) => sample.riskTier),
    ['NORMAL', 'HIGH'],
  );

  assert.deepEqual(report.samples[0], {
    id: 'normal-review',
    riskTier: 'NORMAL',
    branchCount: 3,
    serialWallClockMs: 4400,
    parallelWallClockMs: 2500,
    savedMs: 1900,
    savingsPercent: 43.18,
    speedupRatio: 1.76,
    criticalBranchId: 'remote-ci-observation',
    criticalBranchMs: 1400,
    authority: 'NONE',
  });
  assert.deepEqual(report.samples[1], {
    id: 'high-review',
    riskTier: 'HIGH',
    branchCount: 4,
    serialWallClockMs: 8400,
    parallelWallClockMs: 3800,
    savedMs: 4600,
    savingsPercent: 54.76,
    speedupRatio: 2.21,
    criticalBranchId: 'remote-ci-observation',
    criticalBranchMs: 2100,
    authority: 'NONE',
  });
  assert.deepEqual(report.aggregate, {
    serialWallClockMs: 12800,
    parallelWallClockMs: 6300,
    savedMs: 6500,
    savingsPercent: 50.78,
    speedupRatio: 2.03,
  });
  assert.equal(parallelBenchmarkCanGrantAuthority(), false);
});

test('parallel benchmark outcome is independent of branch insertion order', () => {
  const [normal] = representativeParallelBenchmarkFixtures();
  const reversed = {
    ...normal,
    branchDurationsMs: Object.fromEntries(Object.entries(normal.branchDurationsMs).reverse()),
  };

  const first = buildParallelBenchmarkReport([normal]);
  const second = buildParallelBenchmarkReport([reversed]);
  assert.deepEqual(first, second);
});

test('parallel benchmark breaks equal critical-branch duration ties deterministically by id', () => {
  const report = buildParallelBenchmarkReport([
    {
      id: 'tie-case',
      riskTier: 'NORMAL',
      beforeFanoutMs: 0,
      branchDurationsMs: {
        zeta: 100,
        alpha: 100,
      },
      joinMs: 0,
      afterJoinMs: 0,
    },
  ]);
  assert.equal(report.samples[0].criticalBranchId, 'alpha');
  assert.equal(report.samples[0].parallelWallClockMs, 100);
  assert.equal(report.samples[0].serialWallClockMs, 200);
});

test('parallel benchmark rejects malformed or misleading fixtures', () => {
  assert.throws(() => buildParallelBenchmarkReport([]), /at least one sample/);
  assert.throws(
    () =>
      buildParallelBenchmarkReport([
        {
          id: 'one',
          riskTier: 'NORMAL',
          beforeFanoutMs: 0,
          branchDurationsMs: { only: 1 },
          joinMs: 0,
          afterJoinMs: 0,
        },
      ]),
    /at least two branches/,
  );
  assert.throws(
    () =>
      buildParallelBenchmarkReport([
        {
          id: 'bad-risk',
          riskTier: 'CRITICAL',
          beforeFanoutMs: 0,
          branchDurationsMs: { 'branch-a': 1, 'branch-b': 2 },
          joinMs: 0,
          afterJoinMs: 0,
        },
      ]),
    /riskTier/,
  );
  assert.throws(
    () =>
      buildParallelBenchmarkReport([
        {
          id: 'bad-duration',
          riskTier: 'NORMAL',
          beforeFanoutMs: 0,
          branchDurationsMs: { 'branch-a': 0, 'branch-b': 2 },
          joinMs: 0,
          afterJoinMs: 0,
        },
      ]),
    /duration/,
  );
  assert.throws(
    () =>
      buildParallelBenchmarkReport([
        {
          id: 'duplicate',
          riskTier: 'NORMAL',
          beforeFanoutMs: 0,
          branchDurationsMs: { 'branch-a': 1, 'branch-b': 2 },
          joinMs: 0,
          afterJoinMs: 0,
        },
        {
          id: 'duplicate',
          riskTier: 'HIGH',
          beforeFanoutMs: 0,
          branchDurationsMs: { 'branch-a': 2, 'branch-b': 3 },
          joinMs: 0,
          afterJoinMs: 0,
        },
      ]),
    /duplicate/,
  );
});
