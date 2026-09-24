import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  GeminiProviderAdapter,
  GeminiProviderInvocationError,
  ModelCatalogManagementService,
} from '../dist/index.js';
import { runProviderAdapterConformance } from './provider-conformance.mjs';

async function createHarness(mode, overrides = {}) {
  const timers = new Set();
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers['x-goog-api-key'],
      client: request.headers['x-goog-api-client'],
    });

    if (mode === 'transport-failure') {
      request.socket.destroy();
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/models')) {
      if (mode === 'unhealthy') {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'unavailable' } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          models: [
            {
              name: 'models/conformance-model',
              displayName: 'Conformance Model',
              inputTokenLimit: 100000,
              outputTokenLimit: 8192,
              supportedGenerationMethods: ['generateContent', 'countTokens'],
              thinking: true,
            },
          ],
        }),
      );
      return;
    }

    if (mode === 'timeout') {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!response.destroyed) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'late' }] } }],
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

    if (request.url?.endsWith(':countTokens')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ totalTokens: 17 }));
      return;
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: 'internal thought', thought: true },
                { text: 'conformance ' },
                { text: 'output' },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          cachedContentTokenCount: 40,
          candidatesTokenCount: 25,
          thoughtsTokenCount: 10,
          totalTokenCount: 135,
        },
        echo: body,
      }),
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const adapter = new GeminiProviderAdapter('gemini-conformance', {
    apiKey: 'runtime-only-test-key',
    baseUrl: `http://127.0.0.1:${address.port}`,
    healthTimeoutMs: 250,
    thinkingProfiles: {
      'conformance-model': {
        mode: 'LEVEL',
        supportedEfforts: ['low', 'medium', 'high'],
      },
    },
    ...overrides,
  });

  return {
    adapter,
    requests,
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

test('Gemini adapter satisfies shared provider conformance', async (t) => {
  await runProviderAdapterConformance(t, {
    expectedCapabilities: ['reasoning_effort', 'token_counting', 'usage_token_breakdown'],
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
    assertEffortMapping: async (adapter) => {
      await assert.rejects(
        () =>
          adapter.invoke({
            logicalRole: 'review',
            input: 'probe',
            model: 'conformance-model',
            effort: 'extra-high',
            timeoutMs: 250,
          }),
        (error) =>
          error?.kind === 'malformed_output' && /unsupported effort: extra-high/.test(error.message),
      );
    },
    expectedSuccess: {
      output: 'conformance output',
      model: 'conformance-model',
      usage: {
        inputTokens: 100,
        cachedInputTokens: 40,
        outputTokens: 25,
        reasoningTokens: 10,
        totalTokens: 135,
      },
    },
  });
});

test('Gemini discovery is paginated dynamic and maps provider metadata without static model names', async () => {
  let page = 0;
  const server = createServer((request, response) => {
    assert.equal(request.headers['x-goog-api-key'], 'runtime-key');
    assert.equal(request.headers['x-goog-api-client'], 'freehighlander/0.0.0');
    const url = new URL(request.url, 'http://local');

    if (page++ === 0) {
      assert.equal(url.searchParams.get('pageSize'), '1000');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          models: [
            {
              name: 'models/future-model-xyz',
              displayName: 'Future Model XYZ',
              inputTokenLimit: 200000,
              outputTokenLimit: 16000,
              supportedGenerationMethods: ['generateContent', 'countTokens'],
              thinking: true,
            },
            {
              name: 'models/embed-only',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
          nextPageToken: 'next-page',
        }),
      );
      return;
    }

    assert.equal(url.searchParams.get('pageToken'), 'next-page');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        models: [
          {
            name: 'models/budget-reasoner',
            supportedGenerationMethods: ['generateContent'],
            thinking: true,
          },
          {
            name: 'models/future-model-xyz',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const adapter = new GeminiProviderAdapter('gemini-dynamic', {
    apiKey: 'runtime-key',
    baseUrl: `http://127.0.0.1:${address.port}`,
    thinkingProfiles: {
      'future-model-xyz': {
        mode: 'LEVEL',
        supportedEfforts: ['low', 'medium', 'high'],
        nativeLevels: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' },
      },
      'budget-reasoner': {
        mode: 'BUDGET',
        budgets: { 'thinking-4096': 4096, 'thinking-8192': 8192 },
      },
    },
  });

  try {
    const models = await adapter.listModels();
    assert.deepEqual(
      models.map((model) => model.modelId),
      ['budget-reasoner', 'future-model-xyz'],
    );
    assert.deepEqual(models[1], {
      modelId: 'future-model-xyz',
      displayName: 'Future Model XYZ',
      capabilities: ['reasoning_effort', 'token_counting', 'usage_token_breakdown'],
      supportedEfforts: ['high', 'low', 'medium'],
      contextWindowTokens: 200000,
      maxOutputTokens: 16000,
      locality: 'REMOTE',
    });
    assert.deepEqual(models[0].supportedEfforts, ['thinking-4096', 'thinking-8192']);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('Gemini maps level and budget thinking controls and never sends key in body', async () => {
  const bodies = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    bodies.push(body);
    assert.equal(request.headers['x-goog-api-key'], 'credential-value');
    assert.equal(JSON.stringify(body).includes('credential-value'), false);

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const adapter = new GeminiProviderAdapter('gemini-thinking', {
    apiKey: 'credential-value',
    baseUrl: `http://127.0.0.1:${address.port}`,
    thinkingProfiles: {
      leveler: {
        mode: 'LEVEL',
        supportedEfforts: ['low', 'medium', 'high'],
        nativeLevels: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' },
      },
      budgeter: {
        mode: 'BUDGET',
        budgets: { 'thinking-4096': 4096 },
      },
    },
  });

  try {
    await adapter.invoke({
      logicalRole: 'controller',
      input: 'one',
      model: 'leveler',
      effort: 'medium',
      timeoutMs: 1000,
    });
    await adapter.invoke({
      logicalRole: 'controller',
      input: 'two',
      model: 'budgeter',
      effort: 'thinking-4096',
      timeoutMs: 1000,
    });
    await adapter.invoke({
      logicalRole: 'controller',
      input: 'three',
      model: 'leveler',
      effort: 'default',
      timeoutMs: 1000,
    });

    assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'medium');
    assert.equal(bodies[1].generationConfig.thinkingConfig.thinkingBudget, 4096);
    assert.equal('generationConfig' in bodies[2], false);

    await assert.rejects(
      () =>
        adapter.invoke({
          logicalRole: 'controller',
          input: 'bad',
          model: 'leveler',
          effort: 'extra-high',
          timeoutMs: 1000,
        }),
      /unsupported effort/,
    );
    await assert.rejects(
      () =>
        adapter.invoke({
          logicalRole: 'controller',
          input: 'bad',
          model: 'unprofiled',
          effort: 'high',
          timeoutMs: 1000,
        }),
      /no configured thinking profile/,
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('Gemini countTokens and catalog management refresh compose without credential persistence', async () => {
  let models = ['first-model'];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          models: models.map((model) => ({
            name: `models/${model}`,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          })),
        }),
      );
      return;
    }
    if (request.url?.endsWith(':countTokens')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ totalTokens: 23 }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const adapter = new GeminiProviderAdapter('gemini-managed', {
    apiKey: 'never-persist-this-value',
    baseUrl: `http://127.0.0.1:${address.port}`,
  });
  const providerRegistry = {
    get(id) {
      assert.equal(id, 'gemini-managed');
      return { adapter };
    },
  };
  const audit = [];
  const management = new ModelCatalogManagementService(providerRegistry, {
    append: async (event) => audit.push(event),
  });

  try {
    assert.equal(await adapter.countInputTokens('hello', 'first-model'), 23);
    const first = await management.refreshProvider({
      providerId: 'gemini-managed',
      refreshedAt: '2026-09-24T20:00:00.000Z',
      operationId: 'refresh-1',
    });
    models = ['newly-released-model'];
    const second = await management.refreshProvider({
      providerId: 'gemini-managed',
      refreshedAt: '2026-09-24T20:05:00.000Z',
      operationId: 'refresh-2',
    });

    assert.deepEqual(first.addedModelIds, ['first-model']);
    assert.deepEqual(second.addedModelIds, ['newly-released-model']);
    assert.deepEqual(second.becameUnavailableModelIds, ['first-model']);
    assert.equal(JSON.stringify(second.snapshot).includes('never-persist-this-value'), false);
    assert.equal(JSON.stringify(audit).includes('never-persist-this-value'), false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('Gemini malformed discovery token count and constructor inputs fail closed', async () => {
  assert.throws(
    () => new GeminiProviderAdapter('', { apiKey: 'key' }),
    /provider id is required/,
  );
  assert.throws(
    () => new GeminiProviderAdapter('gemini', { apiKey: '   ' }),
    /apiKey is required/,
  );

  for (const payload of [
    {},
    { models: [null] },
    { models: [{ name: 'bad-name', supportedGenerationMethods: ['generateContent'] }] },
    { models: [{ name: 'models/', supportedGenerationMethods: ['generateContent'] }] },
  ]) {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const adapter = new GeminiProviderAdapter('gemini-malformed', {
      apiKey: 'key',
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    try {
      await assert.rejects(() => adapter.listModels(), GeminiProviderInvocationError);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }

  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ totalTokens: -1 }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const adapter = new GeminiProviderAdapter('gemini-bad-count', {
    apiKey: 'key',
    baseUrl: `http://127.0.0.1:${address.port}`,
  });
  try {
    await assert.rejects(
      () => adapter.countInputTokens('hello', 'model'),
      /no valid totalTokens/,
    );
    await assert.rejects(
      () => adapter.countInputTokens('', 'model'),
      /input is required/,
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
