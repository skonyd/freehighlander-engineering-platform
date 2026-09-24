import { measureMonotonicDuration } from './monotonic-timing.js';
import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderFailureKind,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ProviderUsage,
} from './index.js';

export interface OpenAiCompatibleProviderOptions {
  readonly id: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly healthTimeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly monotonicNow?: () => number;
}

export class ProviderInvocationError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderFailureKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderInvocationError';
  }
}

interface ChatCompletionResponse {
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string;
    };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
    readonly prompt_tokens_details?: {
      readonly cached_tokens?: number;
    };
    readonly completion_tokens_details?: {
      readonly reasoning_tokens?: number;
    };
  };
}

export class OpenAiCompatibleProviderAdapter implements ProviderAdapter {
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #healthTimeoutMs: number;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #monotonicNow: () => number;

  constructor(
    readonly id: string,
    options: Omit<OpenAiCompatibleProviderOptions, 'id'>,
  ) {
    if (!id.trim()) throw new Error('provider id is required');
    if (!options.baseUrl.trim()) throw new Error('baseUrl is required');

    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.#healthTimeoutMs = options.healthTimeoutMs ?? 5_000;
    this.#headers = options.headers ?? {};
    this.#monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  capabilities(): ReadonlySet<ProviderCapability> {
    // Generic OpenAI-compatible servers do not define a standard token-count
    // endpoint. Do not advertise token_counting unless an adapter implements it.
    return new Set<ProviderCapability>(['usage_token_breakdown']);
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.#fetchWithTimeout(
        `${this.#baseUrl}/v1/models`,
        { method: 'GET', headers: this.#requestHeaders() },
        this.#healthTimeoutMs,
      );

      if (!response.ok) {
        return {
          available: false,
          detail: `HTTP ${response.status}`,
        };
      }

      return { available: true };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : 'unknown provider error',
      };
    }
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.input) throw new ProviderInvocationError('input is required', 'malformed_output');
    if (!request.model) throw new ProviderInvocationError('model is required', 'malformed_output');
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs < 1) {
      throw new ProviderInvocationError('timeoutMs must be positive', 'malformed_output');
    }

    const startedAtMonoMs = this.#monotonicNow();

    let response: Response;
    try {
      response = await this.#fetchWithTimeout(
        `${this.#baseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: this.#requestHeaders(),
          body: JSON.stringify({
            model: request.model,
            messages: [{ role: 'user', content: request.input }],
            stream: false,
            ...(request.effort ? { reasoning_effort: request.effort } : {}),
          }),
        },
        request.timeoutMs,
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw new ProviderInvocationError('provider request timed out', 'transport_failure');
      }
      throw new ProviderInvocationError(
        error instanceof Error ? error.message : 'provider transport failed',
        'transport_failure',
      );
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new ProviderInvocationError(
        `provider returned HTTP ${response.status}: ${truncate(raw, 500)}`,
        classifyHttpFailure(response.status, raw),
        response.status,
        parseRetryAfterMs(response.headers.get('retry-after')),
      );
    }

    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(raw) as ChatCompletionResponse;
    } catch {
      throw new ProviderInvocationError('provider returned invalid JSON', 'malformed_output');
    }

    const output = parsed.choices?.[0]?.message?.content;
    if (typeof output !== 'string') {
      throw new ProviderInvocationError(
        'provider response has no assistant content',
        'malformed_output',
      );
    }

    const mappedUsage = mapUsage(parsed.usage);

    const latency = measureMonotonicDuration(startedAtMonoMs, this.#monotonicNow());

    return {
      output,
      model: parsed.model ?? request.model,
      ...(mappedUsage ? { usage: mappedUsage } : {}),
      latencyMs: latency.durationMs,
    };
  }

  #requestHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...this.#headers,
      ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {}),
    };
  }

  async #fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapUsage(usage: ChatCompletionResponse['usage']): ProviderUsage | undefined {
  if (!usage) return undefined;

  const inputTokens = numberValue(usage.prompt_tokens);
  const cachedInputTokens = numberValue(usage.prompt_tokens_details?.cached_tokens);
  const outputTokens = numberValue(usage.completion_tokens);
  const reasoningTokens = numberValue(usage.completion_tokens_details?.reasoning_tokens);
  const totalTokens = numberValue(usage.total_tokens);

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function classifyHttpFailure(status: number, body: string): ProviderFailureKind {
  if (status === 401 || status === 403) return 'auth_unavailable';
  if (status === 429) {
    return /quota|limit|exhaust/i.test(body) ? 'quota_exhausted' : 'rate_limited';
  }
  if (status >= 500) return 'provider_unavailable';
  return 'transport_failure';
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1_000);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : !!error &&
        typeof error === 'object' &&
        'name' in error &&
        (error as { readonly name?: string }).name === 'AbortError';
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function numberValue(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
