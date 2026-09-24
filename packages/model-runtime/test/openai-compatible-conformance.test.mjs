import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { OpenAiCompatibleProviderAdapter } from '../dist/index.js';
import { runProviderAdapterConformance } from './provider-conformance.mjs';

async function createHarness(mode, adapterOverrides = {}) {
  const timers = new Set();
  const server = createServer((request, response) => {
    if (mode === 'transport-failure') {
      request.socket.destroy();
      return;
    }

    if (request.url === '/v1/models') {
      if (mode === 'unhealthy') {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'provider unavailable' } }));
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'conformance-model' }] }));
      return;
    }

    if (mode === 'timeout') {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!response.destroyed) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              model: 'conformance-model-returned',
              choices: [{ message: { content: 'late output' } }],
            }),
          );
        }
      }, 1_000);
      timers.add(timer);
      return;
    }

    if (mode === 'auth-failure') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'authentication failed' } }));
      return;
    }

    if (mode === 'quota-failure') {
      response.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': '2',
      });
      response.end(JSON.stringify({ error: { message: 'quota exhausted' } }));
      return;
    }

    if (mode === 'rate-limit-failure') {
      response.writeHead(429, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'too many requests' } }));
      return;
    }

    if (mode === 'provider-failure') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'upstream unavailable' } }));
      return;
    }

    if (mode === 'malformed-failure') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{not-json');
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        model: 'conformance-model-returned',
        choices: [{ message: { content: 'conformance output' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const adapter = new OpenAiCompatibleProviderAdapter('conformance-openai-compatible', {
    baseUrl: `http://127.0.0.1:${address.port}`,
    healthTimeoutMs: 250,
    ...adapterOverrides,
  });

  return {
    adapter,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test('OpenAI-compatible adapter satisfies shared provider conformance', async (t) => {
  await runProviderAdapterConformance(t, {
    expectedCapabilities: ['usage_token_breakdown'],
    expectMonotonicLatency: true,
    healthy: () => createHarness('healthy'),
    unhealthy: () => createHarness('unhealthy'),
    success: () => createHarness('success'),
    timeout: () => createHarness('timeout'),
    authFailure: () => createHarness('auth-failure'),
    quotaFailure: () => createHarness('quota-failure'),
    rateLimitFailure: () => createHarness('rate-limit-failure'),
    providerFailure: () => createHarness('provider-failure'),
    transportFailure: () => createHarness('transport-failure'),
    malformedFailure: () => createHarness('malformed-failure'),
    expectedSuccess: {
      output: 'conformance output',
      model: 'conformance-model-returned',
      usage: {
        inputTokens: 100,
        cachedInputTokens: 40,
        outputTokens: 25,
        reasoningTokens: 10,
        totalTokens: 125,
      },
    },
  });
});

test('OpenAI-compatible latency uses only the injected monotonic clock', async () => {
  const ticks = [100, 145];
  const harness = await createHarness('success', {
    monotonicNow: () => ticks.shift(),
  });

  try {
    const originalDateNow = Date.now;
    let wallNow = 9_000_000;
    Date.now = () => {
      wallNow -= 1_000_000;
      return wallNow;
    };

    try {
      const result = await harness.adapter.invoke({
        logicalRole: 'conformance-review',
        input: 'probe',
        model: 'conformance-model',
        timeoutMs: 2_000,
      });
      assert.equal(result.latencyMs, 45);
    } finally {
      Date.now = originalDateNow;
    }
  } finally {
    await harness.close();
  }
});

test('OpenAI-compatible latency fails closed when monotonic clock moves backwards', async () => {
  const ticks = [100, 99];
  const harness = await createHarness('success', {
    monotonicNow: () => ticks.shift(),
  });

  try {
    await assert.rejects(
      () =>
        harness.adapter.invoke({
          logicalRole: 'conformance-review',
          input: 'probe',
          model: 'conformance-model',
          timeoutMs: 2_000,
        }),
      /monotonic clock cannot move backwards/,
    );
  } finally {
    await harness.close();
  }
});

test('OpenAI-compatible model discovery maps /v1/models without inventing capabilities', async () => {
  const harness = await createHarness('healthy');

  try {
    const models = await harness.adapter.listModels();
    assert.deepEqual(models, [
      {
        modelId: 'conformance-model',
        displayName: 'conformance-model',
        locality: 'REMOTE',
      },
    ]);
  } finally {
    await harness.close();
  }
});

test('OpenAI-compatible model discovery supports explicit local endpoint classification', async () => {
  const harness = await createHarness('healthy', { modelLocality: 'LOCAL' });

  try {
    const models = await harness.adapter.listModels();
    assert.equal(models[0].locality, 'LOCAL');
  } finally {
    await harness.close();
  }
});

test('OpenAI-compatible model discovery fails closed on malformed model payload', async () => {
  const timers = new Set();
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: '' }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const adapter = new OpenAiCompatibleProviderAdapter('malformed-model-list', {
    baseUrl: `http://127.0.0.1:${address.port}`,
    healthTimeoutMs: 250,
  });

  try {
    await assert.rejects(
      () => adapter.listModels(),
      (error) => error?.kind === 'malformed_output' && /invalid model id/.test(error.message),
    );
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('OpenAI-compatible model discovery classifies HTTP failures', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'authentication failed' } }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const adapter = new OpenAiCompatibleProviderAdapter('model-list-auth', {
    baseUrl: `http://127.0.0.1:${address.port}`,
    healthTimeoutMs: 250,
  });

  try {
    await assert.rejects(
      () => adapter.listModels(),
      (error) => error?.kind === 'auth_unavailable' && error?.status === 401,
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
