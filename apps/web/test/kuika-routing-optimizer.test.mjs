import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FH_KUIKA_ROUTING_HTML,
  createDashboardServer,
  optimizeFhKuikaRoutingV1,
  routingOptimizerCanExecuteCall,
  routingOptimizerCanGrantAuthority,
  routingOptimizerCanRetrySemanticFailure,
  routingOptimizerCanUseSemanticOutcome,
  routingPageCanGrantAuthority,
  routingPageCanInvokeModel,
  routingPageCanMutateBindings,
  routingSimulationCanExecuteCall,
  simulateFhKuikaRoutingScenarioV1,
} from '../dist/index.js';

function candidate(overrides = {}) {
  return {
    bindingId: 'preferred',
    provider: 'provider',
    model: 'model',
    locality: 'REMOTE',
    qualified: true,
    supportedRiskTiers: ['NORMAL', 'HIGH', 'CRITICAL'],
    allowedDataClasses: ['PUBLIC', 'INTERNAL'],
    capabilities: ['review'],
    maxContextTokens: 100_000,
    independenceGroup: 'group-a',
    health: 'AVAILABLE',
    estimatedCallCostUsd: 0.2,
    observedLatencyMs: 1_000,
    ...overrides,
  };
}

test('routing optimizer prefers eligible preferred binding and is non-authoritative', () => {
  const decision = optimizeFhKuikaRoutingV1({
    schemaVersion: 1,
    logicalRole: 'security-reviewer',
    preferredBindingId: 'preferred',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
    requiredCapabilities: ['review'],
    requiredContextTokens: 50_000,
    excludedIndependenceGroups: [],
    maxEstimatedCallCostUsd: 1,
    authority: 'NONE',
    candidates: [
      candidate(),
      candidate({ bindingId: 'fallback', independenceGroup: 'group-b' }),
    ],
  });

  assert.equal(decision.selectedBindingId, 'preferred');
  assert.equal(decision.semanticOutcomeConsidered, false);
  assert.equal(decision.authority, 'NONE');
  assert.equal(decision.executionAuthorized, false);
  assert.match(decision.reason, /Preferred binding satisfies/);

  assert.equal(routingOptimizerCanGrantAuthority(), false);
  assert.equal(routingOptimizerCanExecuteCall(), false);
  assert.equal(routingOptimizerCanUseSemanticOutcome(), false);
  assert.equal(routingOptimizerCanRetrySemanticFailure(), false);
});

test('routing optimizer falls back only from deterministic pre-call constraints', () => {
  const decision = optimizeFhKuikaRoutingV1({
    schemaVersion: 1,
    logicalRole: 'security-reviewer',
    preferredBindingId: 'preferred',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
    requiredCapabilities: ['review'],
    requiredContextTokens: 50_000,
    excludedIndependenceGroups: [],
    authority: 'NONE',
    candidates: [
      candidate({ health: 'QUOTA_EXHAUSTED' }),
      candidate({ bindingId: 'fallback', independenceGroup: 'group-b' }),
    ],
  });

  assert.equal(decision.selectedBindingId, 'fallback');
  assert.deepEqual(decision.evaluations[0]?.exclusionReasons, ['UNAVAILABLE']);
  assert.equal(decision.semanticOutcomeConsidered, false);
  assert.match(decision.reason, /Preferred binding is ineligible/);
});

test(
  'routing optimizer explains data, capability, context, independence and cost exclusions',
  () => {
    const decision = optimizeFhKuikaRoutingV1({
    schemaVersion: 1,
    logicalRole: 'reviewer',
    preferredBindingId: 'blocked',
    riskTier: 'CRITICAL',
    dataClassification: 'SECRET',
    requiredCapabilities: ['review', 'tool-use'],
    requiredContextTokens: 200_000,
    excludedIndependenceGroups: ['same-producer'],
    maxEstimatedCallCostUsd: 0.1,
    authority: 'NONE',
    candidates: [
      candidate({
        bindingId: 'blocked',
        qualified: false,
        supportedRiskTiers: ['NORMAL'],
        allowedDataClasses: ['PUBLIC'],
        capabilities: ['review'],
        maxContextTokens: 64_000,
        independenceGroup: 'same-producer',
        estimatedCallCostUsd: 0.5,
      }),
    ],
  });

  assert.equal(decision.selectedBindingId, null);
  const reasons = decision.evaluations[0]?.exclusionReasons ?? [];
  assert.ok(reasons.includes('NOT_QUALIFIED'));
  assert.ok(reasons.includes('RISK_TIER_UNSUPPORTED'));
  assert.ok(reasons.includes('DATA_CLASS_UNSUPPORTED'));
  assert.ok(reasons.includes('REQUIRED_CAPABILITY_MISSING'));
  assert.ok(reasons.includes('CONTEXT_TOO_SMALL'));
  assert.ok(reasons.includes('INDEPENDENCE_CONFLICT'));
    assert.ok(reasons.includes('COST_LIMIT_EXCEEDED'));
  },
);

test('routing request rejects duplicate bindings and invalid authority', () => {
  const base = {
    schemaVersion: 1,
    logicalRole: 'reviewer',
    preferredBindingId: 'preferred',
    riskTier: 'HIGH',
    dataClassification: 'INTERNAL',
    requiredCapabilities: ['review'],
    requiredContextTokens: 10_000,
    excludedIndependenceGroups: [],
    authority: 'NONE',
    candidates: [candidate()],
  };

  assert.throws(
    () => optimizeFhKuikaRoutingV1({ ...base, candidates: [candidate(), candidate()] }),
    /bindingIds must be unique/,
  );

  assert.throws(
    () => optimizeFhKuikaRoutingV1({ ...base, authority: 'CONTROL_PLANE' }),
    /authority must be NONE/,
  );
});

test(
  'routing simulator preserves availability-only fallback and data locality constraints',
  () => {
    const available = simulateFhKuikaRoutingScenarioV1();
  assert.equal(available.selectedBindingId, 'preferred-review');

  const quota = simulateFhKuikaRoutingScenarioV1({
    preferredHealth: 'QUOTA_EXHAUSTED',
  });
  assert.equal(quota.selectedBindingId, 'fallback-review');

  const secret = simulateFhKuikaRoutingScenarioV1({
    dataClassification: 'SECRET',
    riskTier: 'HIGH',
    requiredContextTokens: 50_000,
  });
  assert.equal(secret.selectedBindingId, 'local-review');

  const secretCritical = simulateFhKuikaRoutingScenarioV1({
    dataClassification: 'SECRET',
    riskTier: 'CRITICAL',
  });
  assert.equal(secretCritical.selectedBindingId, null);

    assert.equal(routingSimulationCanExecuteCall(), false);
  },
);

test('routing UI is a simulator and exposes no binding mutation controls', () => {
  assert.match(FH_KUIKA_ROUTING_HTML, /Deterministic pre-call routing simulation/);
  assert.match(FH_KUIKA_ROUTING_HTML, /Semantic outputs, findings and verdicts are not/);
  assert.doesNotMatch(FH_KUIKA_ROUTING_HTML, /id="apply"/);
  assert.doesNotMatch(FH_KUIKA_ROUTING_HTML, /id="save-binding"/);

  assert.equal(routingPageCanInvokeModel(), false);
  assert.equal(routingPageCanMutateBindings(), false);
  assert.equal(routingPageCanGrantAuthority(), false);
});

test('routing HTTP simulation is GET-only and validates scenario inputs', async () => {
  const server = createDashboardServer({
    databasePath: '/tmp/fh-kuika-routing-no-db.sqlite',
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;

    const page = await fetch(base + '/modules/fh-kuika/integrate/routing');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Models & Routing/);

    const result = await (
      await fetch(
        base +
          '/api/modules/fh-kuika/routing/simulate?risk=HIGH&data=INTERNAL&context=50000&preferredHealth=QUOTA_EXHAUSTED',
      )
    ).json();
    assert.equal(result.decision.selectedBindingId, 'fallback-review');
    assert.equal(result.decision.semanticOutcomeConsidered, false);

    const invalid = await fetch(
      base + '/api/modules/fh-kuika/routing/simulate?risk=IMPOSSIBLE',
    );
    assert.equal(invalid.status, 400);

    const denied = await fetch(base + '/api/modules/fh-kuika/routing/simulate', {
      method: 'POST',
    });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
