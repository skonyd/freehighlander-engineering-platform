import {
  optimizeFhKuikaRoutingV1,
  type FhKuikaRoutingDataClass,
  type FhKuikaRoutingDecisionV1,
  type FhKuikaRoutingHealth,
  type FhKuikaRoutingRiskTier,
} from './kuika-routing-optimizer.js';

export interface FhKuikaRoutingSimulationInputV1 {
  readonly riskTier?: FhKuikaRoutingRiskTier;
  readonly dataClassification?: FhKuikaRoutingDataClass;
  readonly requiredContextTokens?: number;
  readonly preferredHealth?: FhKuikaRoutingHealth;
}

export function simulateFhKuikaRoutingScenarioV1(
  input: FhKuikaRoutingSimulationInputV1 = {},
): FhKuikaRoutingDecisionV1 {
  const riskTier = input.riskTier ?? 'HIGH';
  const dataClassification = input.dataClassification ?? 'INTERNAL';
  const requiredContextTokens = input.requiredContextTokens ?? 50_000;
  const preferredHealth = input.preferredHealth ?? 'AVAILABLE';

  return optimizeFhKuikaRoutingV1({
    schemaVersion: 1,
    logicalRole: 'security-reviewer',
    preferredBindingId: 'preferred-review',
    riskTier,
    dataClassification,
    requiredCapabilities: ['review'],
    requiredContextTokens,
    excludedIndependenceGroups: [],
    maxEstimatedCallCostUsd: 1,
    authority: 'NONE',
    candidates: [
      {
        bindingId: 'preferred-review',
        provider: 'claude-cli',
        model: 'opus',
        locality: 'REMOTE',
        qualified: true,
        supportedRiskTiers: ['NORMAL', 'HIGH', 'CRITICAL'],
        allowedDataClasses: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
        capabilities: ['review', 'tool-use'],
        maxContextTokens: 200_000,
        independenceGroup: 'claude',
        health: preferredHealth,
        estimatedCallCostUsd: 0.5,
        observedLatencyMs: 4_500,
      },
      {
        bindingId: 'fallback-review',
        provider: 'openai',
        model: 'gpt',
        locality: 'REMOTE',
        qualified: true,
        supportedRiskTiers: ['NORMAL', 'HIGH', 'CRITICAL'],
        allowedDataClasses: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
        capabilities: ['review', 'tool-use'],
        maxContextTokens: 128_000,
        independenceGroup: 'openai',
        health: 'AVAILABLE',
        estimatedCallCostUsd: 0.35,
        observedLatencyMs: 3_800,
      },
      {
        bindingId: 'local-review',
        provider: 'local',
        model: 'qwen',
        locality: 'LOCAL',
        qualified: true,
        supportedRiskTiers: ['NORMAL', 'HIGH'],
        allowedDataClasses: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET'],
        capabilities: ['review'],
        maxContextTokens: 64_000,
        independenceGroup: 'local',
        health: 'AVAILABLE',
        estimatedCallCostUsd: 0,
        observedLatencyMs: 7_000,
      },
    ],
  });
}

export function routingSimulationCanExecuteCall(): false {
  return false;
}
