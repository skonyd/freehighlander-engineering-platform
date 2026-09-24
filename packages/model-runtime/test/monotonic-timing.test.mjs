import assert from 'node:assert/strict';
import test from 'node:test';

import {
  measureMonotonicDuration,
  monotonicDurationCanGrantAuthority,
  wallClockCanAffectMonotonicDuration,
} from '../dist/index.js';

test('monotonic duration ignores forward and backward wall-clock jumps', () => {
  const forwardWallJump = {
    wallStartMs: 1_000,
    wallEndMs: 9_999_999,
  };
  const backwardWallJump = {
    wallStartMs: 9_999_999,
    wallEndMs: 1_000,
  };

  const forward = measureMonotonicDuration(100, 145);
  const backward = measureMonotonicDuration(200, 245);

  assert.equal(forward.durationMs, 45);
  assert.equal(backward.durationMs, 45);
  assert.notEqual(forwardWallJump.wallEndMs - forwardWallJump.wallStartMs, forward.durationMs);
  assert.notEqual(backwardWallJump.wallEndMs - backwardWallJump.wallStartMs, backward.durationMs);
});

test('zero monotonic duration is valid', () => {
  assert.deepEqual(measureMonotonicDuration(100, 100), {
    startedAtMonoMs: 100,
    completedAtMonoMs: 100,
    durationMs: 0,
  });
});

test('monotonic duration fails closed on invalid or backwards clocks', () => {
  for (const [start, end] of [
    [-1, 10],
    [0, -1],
    [Number.NaN, 10],
    [0, Number.POSITIVE_INFINITY],
  ]) {
    assert.throws(() => measureMonotonicDuration(start, end), /non-negative finite number/);
  }

  assert.throws(() => measureMonotonicDuration(101, 100), /cannot move backwards/);
});

test('monotonic timing is authority-neutral and wall-clock independent by contract', () => {
  assert.equal(wallClockCanAffectMonotonicDuration(), false);
  assert.equal(monotonicDurationCanGrantAuthority(), false);
});
