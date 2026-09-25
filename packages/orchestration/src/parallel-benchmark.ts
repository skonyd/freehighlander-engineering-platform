export type BenchmarkRiskTier = 'NORMAL' | 'HIGH';

export interface ParallelBenchmarkSampleInput {
  readonly id: string;
  readonly riskTier: BenchmarkRiskTier;
  readonly beforeFanoutMs: number;
  readonly branchDurationsMs: Readonly<Record<string, number>>;
  readonly joinMs: number;
  readonly afterJoinMs: number;
}

export interface ParallelBenchmarkSampleResult {
  readonly id: string;
  readonly riskTier: BenchmarkRiskTier;
  readonly branchCount: number;
  readonly serialWallClockMs: number;
  readonly parallelWallClockMs: number;
  readonly savedMs: number;
  readonly savingsPercent: number;
  readonly speedupRatio: number;
  readonly criticalBranchId: string;
  readonly criticalBranchMs: number;
  readonly authority: 'NONE';
}

export interface ParallelBenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly methodology: 'REPRESENTATIVE_DETERMINISTIC_FIXTURE';
  readonly samples: readonly ParallelBenchmarkSampleResult[];
  readonly aggregate: {
    readonly serialWallClockMs: number;
    readonly parallelWallClockMs: number;
    readonly savedMs: number;
    readonly savingsPercent: number;
    readonly speedupRatio: number;
  };
  readonly authority: 'NONE';
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function buildParallelBenchmarkReport(
  samples: readonly ParallelBenchmarkSampleInput[],
): ParallelBenchmarkReportV1 {
  if (samples.length === 0) throw new Error('parallel benchmark requires at least one sample');

  const seen = new Set<string>();
  const results = samples.map((sample) => {
    validateSample(sample);
    if (seen.has(sample.id))
      throw new Error('duplicate parallel benchmark sample id: ' + sample.id);
    seen.add(sample.id);

    const branches = Object.entries(sample.branchDurationsMs).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const serialBranchesMs = branches.reduce((sum, [, duration]) => sum + duration, 0);
    const [criticalBranchId, criticalBranchMs] = branches.reduce((best, current) => {
      if (
        current[1] > best[1] ||
        (current[1] === best[1] && current[0].localeCompare(best[0]) < 0)
      ) {
        return current;
      }
      return best;
    }, branches[0]!);

    const commonMs = sample.beforeFanoutMs + sample.joinMs + sample.afterJoinMs;
    const serialWallClockMs = commonMs + serialBranchesMs;
    const parallelWallClockMs = commonMs + criticalBranchMs;
    const savedMs = serialWallClockMs - parallelWallClockMs;

    return {
      id: sample.id,
      riskTier: sample.riskTier,
      branchCount: branches.length,
      serialWallClockMs,
      parallelWallClockMs,
      savedMs,
      savingsPercent: roundRatio((savedMs / serialWallClockMs) * 100),
      speedupRatio: roundRatio(serialWallClockMs / parallelWallClockMs),
      criticalBranchId,
      criticalBranchMs,
      authority: 'NONE' as const,
    };
  });

  const serialWallClockMs = results.reduce((sum, sample) => sum + sample.serialWallClockMs, 0);
  const parallelWallClockMs = results.reduce((sum, sample) => sum + sample.parallelWallClockMs, 0);
  const savedMs = serialWallClockMs - parallelWallClockMs;

  return {
    schemaVersion: 1,
    methodology: 'REPRESENTATIVE_DETERMINISTIC_FIXTURE',
    samples: results,
    aggregate: {
      serialWallClockMs,
      parallelWallClockMs,
      savedMs,
      savingsPercent: roundRatio((savedMs / serialWallClockMs) * 100),
      speedupRatio: roundRatio(serialWallClockMs / parallelWallClockMs),
    },
    authority: 'NONE',
  };
}

export function representativeParallelBenchmarkFixtures(): readonly ParallelBenchmarkSampleInput[] {
  return [
    {
      id: 'normal-review',
      riskTier: 'NORMAL',
      beforeFanoutMs: 120,
      branchDurationsMs: {
        'deterministic-verification': 800,
        'local-pre-review': 1100,
        'remote-ci-observation': 1400,
      },
      joinMs: 80,
      afterJoinMs: 900,
    },
    {
      id: 'high-review',
      riskTier: 'HIGH',
      beforeFanoutMs: 180,
      branchDurationsMs: {
        'deterministic-verification': 1200,
        'local-pre-review': 1500,
        'remote-ci-observation': 2100,
        'test-adequacy-specialist': 1900,
      },
      joinMs: 120,
      afterJoinMs: 1400,
    },
  ];
}

export function parallelBenchmarkCanGrantAuthority(): false {
  return false;
}

function validateSample(sample: ParallelBenchmarkSampleInput): void {
  requireId(sample.id, 'sample id');
  if (sample.riskTier !== 'NORMAL' && sample.riskTier !== 'HIGH') {
    throw new Error('parallel benchmark riskTier must be NORMAL or HIGH');
  }
  requireNonNegativeInteger(sample.beforeFanoutMs, 'beforeFanoutMs');
  requireNonNegativeInteger(sample.joinMs, 'joinMs');
  requireNonNegativeInteger(sample.afterJoinMs, 'afterJoinMs');

  const branches = Object.entries(sample.branchDurationsMs);
  if (branches.length < 2) throw new Error('parallel benchmark requires at least two branches');
  for (const [branchId, duration] of branches) {
    requireId(branchId, 'branch id');
    if (!Number.isInteger(duration) || duration < 1) {
      throw new Error('parallel benchmark branch duration must be an integer >= 1');
    }
  }
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}
