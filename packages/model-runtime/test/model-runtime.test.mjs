import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  OpenAiCompatibleProviderAdapter,
  ProviderInvocationError,
  isAvailabilityFailure,
  preflightInputTokenBudget,
  tokenBudgetCanAuthorizeEvidenceRemoval,
} from '../dist/index.js';

test('fallback eligibility is limited to availability failures', () => {
  assert.equal(isAvailabilityFailure('quota_exhausted'), true);
  assert.equal(isAvailabilityFailure('provider_unavailable'), true);
  assert.equal(isAvailabilityFailure('semantic_failure'), false);
  assert.equal(isAvailabilityFailure('malformed_output'), false);
});

test('token budget preflight uses exact provider counting when available', async () => {
  const provider = {
    id: 'counter',
    capabilities: () => new Set(['token_counting']),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'unused', model: 'unused' }),
    countInputTokens: async () => 120,
  };

  const result = await preflightInputTokenBudget(provider, 'input', 'model', {
    targetInputTokens: 100,
    hardWarnTokens: 200,
  });

  assert.equal(result.status, 'OVER_TARGET');
  assert.equal(result.countSource, 'provider');
  assert.equal(result.estimatedInputTokens, 120);
  assert.equal(result.requiredEvidenceMayBeDropped, false);
  assert.equal(tokenBudgetCanAuthorizeEvidenceRemoval(), false);
});

test('token budget preflight is UNKNOWN rather than guessing without provider counting', async () => {
  const provider = {
    id: 'no-counter',
    capabilities: () => new Set(),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'unused', model: 'unused' }),
  };

  const result = await preflightInputTokenBudget(provider, 'a very long input', 'model', {
    targetInputTokens: 100,
    hardWarnTokens: 200,
  });

  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.countSource, 'unavailable');
  assert.equal(result.estimatedInputTokens, undefined);
  assert.equal(result.requiredEvidenceMayBeDropped, false);
});

test('token budget preflight validates policy bounds', async () => {
  const provider = {
    id: 'counter',
    capabilities: () => new Set(['token_counting']),
    health: async () => ({ available: true }),
    invoke: async () => ({ output: 'unused', model: 'unused' }),
    countInputTokens: async () => 10,
  };

  await assert.rejects(
    () =>
      preflightInputTokenBudget(provider, 'input', 'model', {
        targetInputTokens: 200,
        hardWarnTokens: 100,
      }),
    /cannot exceed/,
  );
});

test('OpenAI-compatible adapter maps content and usage without a real model', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'qwen-local' }] }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        model: 'qwen-local',
        choices: [{ message: { content: 'candidate output' } }],
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

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const adapter = new OpenAiCompatibleProviderAdapter('qwen-local', {
      baseUrl: `http://127.0.0.1:${address.port}`,
    });

    assert.equal((await adapter.health()).available, true);
    assert.equal(adapter.capabilities().has('token_counting'), false);
    const result = await adapter.invoke({
      logicalRole: 'repo-analysis',
      input: 'analyze',
      model: 'qwen-local',
      effort: 'medium',
      timeoutMs: 2_000,
    });

    assert.equal(result.output, 'candidate output');
    assert.equal(result.model, 'qwen-local');
    assert.equal(result.usage?.inputTokens, 100);
    assert.equal(result.usage?.cachedInputTokens, 40);
    assert.equal(result.usage?.reasoningTokens, 10);
    assert.equal(result.usage?.totalTokens, 125);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('OpenAI-compatible adapter classifies quota and malformed output', async () => {
  let mode = 'quota';
  const server = createServer((_request, response) => {
    if (mode === 'quota') {
      response.writeHead(429, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'quota exhausted' } }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const adapter = new OpenAiCompatibleProviderAdapter('qwen-local', {
      baseUrl: `http://127.0.0.1:${address.port}`,
    });

    await assert.rejects(
      () =>
        adapter.invoke({
          logicalRole: 'repo-analysis',
          input: 'x',
          model: 'qwen-local',
          timeoutMs: 2_000,
        }),
      (error) => error instanceof ProviderInvocationError && error.kind === 'quota_exhausted',
    );

    mode = 'malformed';
    await assert.rejects(
      () =>
        adapter.invoke({
          logicalRole: 'repo-analysis',
          input: 'x',
          model: 'qwen-local',
          timeoutMs: 2_000,
        }),
      (error) => error instanceof ProviderInvocationError && error.kind === 'malformed_output',
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
