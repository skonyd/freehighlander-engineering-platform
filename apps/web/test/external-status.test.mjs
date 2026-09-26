import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GithubExternalStatusProvider,
  externalStatusCanGrantAuthority,
  externalStatusCanInvokeModel,
} from '../dist/index.js';

const context = {
  repository: 'skonyd/freehighlander-engineering-platform',
  exactRevision: 'abcdef1234567890',
  pullRequest: 42,
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('external status is disabled by default and has no authority', async () => {
  let calls = 0;
  const provider = new GithubExternalStatusProvider({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('must not fetch while disabled');
    },
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
  });

  const status = await provider.read(context);

  assert.equal(status.state, 'DISABLED');
  assert.equal(status.authority, 'NONE');
  assert.equal(status.ci.state, 'UNKNOWN');
  assert.equal(calls, 0);
  assert.equal(externalStatusCanInvokeModel(), false);
  assert.equal(externalStatusCanGrantAuthority(), false);
});

test('external status validates repository and revision before network access', async () => {
  let calls = 0;
  const provider = new GithubExternalStatusProvider({
    enabled: true,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('must not fetch without context');
    },
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
  });

  const status = await provider.read({
    repository: null,
    exactRevision: null,
    pullRequest: null,
  });

  assert.equal(status.state, 'UNKNOWN');
  assert.equal(status.stale, false);
  assert.match(status.message, /Repository or exact revision/);
  assert.equal(calls, 0);
});

test('external status projects CI and PR state and caches results', async () => {
  let calls = 0;
  let now = Date.parse('2026-09-26T10:00:00.000Z');
  const seenHeaders = [];

  const provider = new GithubExternalStatusProvider({
    enabled: true,
    token: 'secret-token',
    apiBase: 'https://api.github.test/',
    cacheTtlMs: 60_000,
    now: () => now,
    fetchImpl: async (url, init) => {
      calls += 1;
      seenHeaders.push(init?.headers);
      if (String(url).includes('/check-runs')) {
        return jsonResponse({
          check_runs: [
            { status: 'completed', conclusion: 'success' },
            { status: 'completed', conclusion: 'neutral' },
            { status: 'in_progress', conclusion: null },
          ],
        });
      }

      return jsonResponse({
        number: 42,
        state: 'open',
        merged: false,
        draft: true,
        html_url: 'https://github.com/skonyd/freehighlander-engineering-platform/pull/42',
      });
    },
  });

  const first = await provider.read(context);
  const second = await provider.read(context);

  assert.equal(first.state, 'OK');
  assert.equal(first.ci.state, 'PENDING');
  assert.equal(first.ci.totalChecks, 3);
  assert.equal(first.ci.successfulChecks, 2);
  assert.equal(first.ci.pendingChecks, 1);
  assert.equal(first.pullRequest?.state, 'OPEN');
  assert.equal(first.pullRequest?.draft, true);
  assert.equal(first.pullRequest?.number, 42);
  assert.equal(
    first.pullRequest?.htmlUrl,
    'https://github.com/skonyd/freehighlander-engineering-platform/pull/42',
  );
  assert.deepEqual(second, first);
  assert.equal(calls, 2);
  assert.ok(seenHeaders.every((headers) => headers.authorization === 'Bearer secret-token'));

  now += 30_000;
  await provider.read(context);
  assert.equal(calls, 2);
});

test('external status marks failed checks degraded and sanitizes PR URLs', async () => {
  const provider = new GithubExternalStatusProvider({
    enabled: true,
    fetchImpl: async (url) => {
      if (String(url).includes('/check-runs')) {
        return jsonResponse({
          check_runs: [
            { status: 'completed', conclusion: 'failure' },
            { status: 'completed', conclusion: 'success' },
          ],
        });
      }

      return jsonResponse({
        number: 42,
        state: 'closed',
        merged: true,
        draft: false,
        html_url: 'https://evil.example/pr/42',
      });
    },
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
  });

  const status = await provider.read(context);

  assert.equal(status.state, 'DEGRADED');
  assert.equal(status.ci.state, 'FAILING');
  assert.equal(status.ci.failedChecks, 1);
  assert.equal(status.pullRequest?.state, 'MERGED');
  assert.equal(status.pullRequest?.htmlUrl, null);
});

test('external status uses stale cached state when refresh fails', async () => {
  let now = Date.parse('2026-09-26T10:00:00.000Z');
  let fail = false;

  const provider = new GithubExternalStatusProvider({
    enabled: true,
    cacheTtlMs: 1_000,
    now: () => now,
    fetchImpl: async (url) => {
      if (fail) throw new Error('network unavailable');

      if (String(url).includes('/check-runs')) {
        return jsonResponse({
          check_runs: [{ status: 'completed', conclusion: 'success' }],
        });
      }

      return jsonResponse({
        number: 42,
        state: 'open',
        merged: false,
        draft: false,
        html_url: 'https://github.com/skonyd/freehighlander-engineering-platform/pull/42',
      });
    },
  });

  const fresh = await provider.read(context);
  assert.equal(fresh.state, 'OK');
  assert.equal(fresh.stale, false);

  now += 2_000;
  fail = true;
  const stale = await provider.read(context);

  assert.equal(stale.state, 'DEGRADED');
  assert.equal(stale.stale, true);
  assert.equal(stale.ci.state, 'PASSING');
  assert.match(stale.message, /cached deterministic status/);
});

test('external status fails open without transport detail leakage', async () => {
  const provider = new GithubExternalStatusProvider({
    enabled: true,
    fetchImpl: async () => new Response('no', { status: 503 }),
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
  });

  const status = await provider.read(context);

  assert.equal(status.state, 'UNKNOWN');
  assert.equal(status.stale, true);
  assert.equal(status.pullRequest, null);
  assert.equal(status.message, 'GitHub status is temporarily unavailable.');
  assert.doesNotMatch(JSON.stringify(status), /503|secret|authorization/i);
});

test('external status supports no-PR contexts and empty checks', async () => {
  let calls = 0;
  const provider = new GithubExternalStatusProvider({
    enabled: true,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ check_runs: [] });
    },
    now: () => Date.parse('2026-09-26T10:00:00.000Z'),
  });

  const status = await provider.read({
    ...context,
    pullRequest: null,
  });

  assert.equal(status.state, 'OK');
  assert.equal(status.pullRequest, null);
  assert.equal(status.ci.state, 'UNKNOWN');
  assert.equal(status.ci.totalChecks, 0);
  assert.equal(calls, 1);
});

test('external status validates bounded timeout and cache settings', () => {
  assert.throws(
    () => new GithubExternalStatusProvider({ timeoutMs: 0 }),
    /timeoutMs must be an integer between 1 and 600000/,
  );
  assert.throws(
    () => new GithubExternalStatusProvider({ cacheTtlMs: 600_001 }),
    /cacheTtlMs must be an integer between 1 and 600000/,
  );
});
