import type { ProviderAdapter } from './index.js';

export interface InputTokenBudget {
  readonly targetInputTokens: number;
  readonly hardWarnTokens: number;
}

export type TokenBudgetStatus = 'WITHIN_TARGET' | 'OVER_TARGET' | 'HARD_WARN' | 'UNKNOWN';

export type TokenCountSource = 'provider' | 'unavailable' | 'provider_error';

export interface TokenBudgetPreflight {
  readonly status: TokenBudgetStatus;
  readonly countSource: TokenCountSource;
  readonly targetInputTokens: number;
  readonly hardWarnTokens: number;
  readonly estimatedInputTokens?: number;
  readonly detail?: string;
  readonly requiredEvidenceMayBeDropped: false;
}

export async function preflightInputTokenBudget(
  provider: ProviderAdapter,
  input: string,
  model: string,
  budget: InputTokenBudget,
): Promise<TokenBudgetPreflight> {
  validateBudget(budget);

  const canCount =
    provider.capabilities().has('token_counting') &&
    typeof provider.countInputTokens === 'function';

  if (!canCount) {
    return {
      status: 'UNKNOWN',
      countSource: 'unavailable',
      targetInputTokens: budget.targetInputTokens,
      hardWarnTokens: budget.hardWarnTokens,
      detail: 'provider does not expose exact input token counting',
      requiredEvidenceMayBeDropped: false,
    };
  }

  let count: number;
  try {
    count = await provider.countInputTokens!(input, model);
  } catch (error) {
    return {
      status: 'UNKNOWN',
      countSource: 'provider_error',
      targetInputTokens: budget.targetInputTokens,
      hardWarnTokens: budget.hardWarnTokens,
      detail: error instanceof Error ? error.message : 'provider token counting failed',
      requiredEvidenceMayBeDropped: false,
    };
  }

  if (!Number.isFinite(count) || count < 0) {
    return {
      status: 'UNKNOWN',
      countSource: 'provider_error',
      targetInputTokens: budget.targetInputTokens,
      hardWarnTokens: budget.hardWarnTokens,
      detail: 'provider returned an invalid token count',
      requiredEvidenceMayBeDropped: false,
    };
  }

  const status: TokenBudgetStatus =
    count <= budget.targetInputTokens
      ? 'WITHIN_TARGET'
      : count <= budget.hardWarnTokens
        ? 'OVER_TARGET'
        : 'HARD_WARN';

  return {
    status,
    countSource: 'provider',
    targetInputTokens: budget.targetInputTokens,
    hardWarnTokens: budget.hardWarnTokens,
    estimatedInputTokens: count,
    requiredEvidenceMayBeDropped: false,
  };
}

export function tokenBudgetCanAuthorizeEvidenceRemoval(): false {
  return false;
}

function validateBudget(budget: InputTokenBudget): void {
  if (!Number.isInteger(budget.targetInputTokens) || budget.targetInputTokens < 1) {
    throw new Error('targetInputTokens must be a positive integer');
  }
  if (!Number.isInteger(budget.hardWarnTokens) || budget.hardWarnTokens < 1) {
    throw new Error('hardWarnTokens must be a positive integer');
  }
  if (budget.targetInputTokens > budget.hardWarnTokens) {
    throw new Error('targetInputTokens cannot exceed hardWarnTokens');
  }
}
