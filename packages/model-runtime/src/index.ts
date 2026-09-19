export { OpenAiCompatibleProviderAdapter, ProviderInvocationError } from './openai-compatible.js';

export type ProviderCapability =
  | 'streaming'
  | 'structured_output'
  | 'tool_calling'
  | 'parallel_tool_calls'
  | 'prompt_caching'
  | 'token_counting'
  | 'reasoning_effort'
  | 'output_verbosity'
  | 'cancellation'
  | 'context_compaction'
  | 'usage_token_breakdown';

export type ProviderFailureKind =
  | 'quota_exhausted'
  | 'rate_limited'
  | 'auth_unavailable'
  | 'provider_unavailable'
  | 'transport_failure'
  | 'semantic_failure'
  | 'malformed_output';

export interface ProviderHealth {
  readonly available: boolean;
  readonly detail?: string;
}

export interface ProviderUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
}

export interface ProviderRequest {
  readonly logicalRole: string;
  readonly input: string;
  readonly model: string;
  readonly effort?: string;
  readonly timeoutMs: number;
}

export interface ProviderResponse {
  readonly output: string;
  readonly model: string;
  readonly usage?: ProviderUsage;
}

export interface ProviderAdapter {
  readonly id: string;
  capabilities(): ReadonlySet<ProviderCapability>;
  health(): Promise<ProviderHealth>;
  invoke(request: ProviderRequest): Promise<ProviderResponse>;
  countInputTokens?(input: string, model: string): Promise<number>;
  cancel?(requestId: string): Promise<void>;
}

const availabilityFailures = new Set<ProviderFailureKind>([
  'quota_exhausted',
  'rate_limited',
  'auth_unavailable',
  'provider_unavailable',
  'transport_failure',
]);

export function isAvailabilityFailure(kind: ProviderFailureKind): boolean {
  return availabilityFailures.has(kind);
}
