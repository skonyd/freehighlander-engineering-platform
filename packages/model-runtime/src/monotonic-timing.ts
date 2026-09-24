export interface MonotonicDurationMeasurement {
  readonly startedAtMonoMs: number;
  readonly completedAtMonoMs: number;
  readonly durationMs: number;
}

export function measureMonotonicDuration(
  startedAtMonoMs: number,
  completedAtMonoMs: number,
): MonotonicDurationMeasurement {
  requireNonNegativeFinite(startedAtMonoMs, 'startedAtMonoMs');
  requireNonNegativeFinite(completedAtMonoMs, 'completedAtMonoMs');
  if (completedAtMonoMs < startedAtMonoMs) {
    throw new Error('monotonic clock cannot move backwards');
  }

  return {
    startedAtMonoMs,
    completedAtMonoMs,
    durationMs: completedAtMonoMs - startedAtMonoMs,
  };
}

export function wallClockCanAffectMonotonicDuration(): false {
  return false;
}

export function monotonicDurationCanGrantAuthority(): false {
  return false;
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(name + ' must be a non-negative finite number');
  }
}
