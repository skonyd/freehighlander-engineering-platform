import { normalizeEffortValue, resolveProviderEffort } from './effort-normalization.js';
import { measureMonotonicDuration } from './monotonic-timing.js';
import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderFailureKind,
  ProviderHealth,
  ProviderModelDiscovery,
  ProviderRequest,
  ProviderResponse,
  ProviderUsage,
} from './index.js';

export type GeminiThinkingProfile =
  | {
      readonly mode: 'LEVEL';
      readonly supportedEfforts: readonly string[];
      readonly nativeLevels?: Readonly<Record<string, string>>;
    }
  | {
      readonly mode: 'BUDGET';
      readonly budgets: Readonly<Record<string, number>>;
    };

export interface GeminiProviderOptions {
  readonly id: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly healthTimeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly monotonicNow?: () => number;
  readonly thinkingProfiles?: Readonly<Record<string, GeminiThinkingProfile>>;
}

export class GeminiProviderInvocationError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderFailureKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'GeminiProviderInvocationError';
  }
}

interface GeminiModelResource {
  readonly name?: unknown;
  readonly displayName?: unknown;
  readonly inputTokenLimit?: unknown;
  readonly outputTokenLimit?: unknown;
  readonly supportedGenerationMethods?: unknown;
  readonly thinking?: unknown;
}

interface GeminiModelsResponse {
  readonly models?: unknown;
  readonly nextPageToken?: unknown;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly text?: unknown;
        readonly thought?: unknown;
      }[];
    };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: unknown;
    readonly cachedContentTokenCount?: unknown;
    readonly candidatesTokenCount?: unknown;
    readonly thoughtsTokenCount?: unknown;
    readonly totalTokenCount?: unknown;
  };
}

interface GeminiCountTokensResponse {
  readonly totalTokens?: unknown;
}

export class GeminiProviderAdapter implements ProviderAdapter {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #healthTimeoutMs: number;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #monotonicNow: () => number;
  readonly #thinkingProfiles: Readonly<Record<string, GeminiThinkingProfile>>;

  constructor(
    readonly id: string,
    options: Omit<GeminiProviderOptions, 'id'>,
  ) {
    if (!id.trim()) throw new Error('provider id is required');
    if (!options.apiKey.trim()) throw new Error('Gemini apiKey is required');

    this.#baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
      /\/+$/,
      '',
    );
    this.#apiKey = options.apiKey;
    this.#healthTimeoutMs = options.healthTimeoutMs ?? 5_000;
    this.#headers = options.headers ?? {};
    this.#monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.#thinkingProfiles = options.thinkingProfiles ?? {};
  }

  capabilities(): ReadonlySet<ProviderCapability> {
    const capabilities = new Set<ProviderCapability>([
      'token_counting',
      'usage_token_breakdown',
    ]);
    if (Object.keys(this.#thinkingProfiles).length > 0) {
      capabilities.add('reasoning_effort');
    }
    return capabilities;
  }

  async health(): Promise<ProviderHealth> {
    try {
      const url = new URL(`${this.#baseUrl}/models`);
      url.searchParams.set('pageSize', '1');
      const response = await this.#fetchWithTimeout(
        url.toString(),
        { method: 'GET', headers: this.#requestHeaders() },
        this.#healthTimeoutMs,
      );
      return response.ok
        ? { available: true }
        : { available: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : 'unknown Gemini provider error',
      };
    }
  }

  async listModels(): Promise<readonly ProviderModelDiscovery[]> {
    const models: ProviderModelDiscovery[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;

    do {
      const url = new URL(`${this.#baseUrl}/models`);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await this.#request(
        url.toString(),
        { method: 'GET', headers: this.#requestHeaders() },
        this.#healthTimeoutMs,
        'Gemini model discovery',
      );
      const parsed = parseJson<GeminiModelsResponse>(response.body, 'Gemini model discovery');
      if (!Array.isArray(parsed.models)) {
        throw new GeminiProviderInvocationError(
          'Gemini model discovery response has no models array',
          'malformed_output',
        );
      }

      for (const raw of parsed.models) {
        if (!raw || typeof raw !== 'object') {
          throw new GeminiProviderInvocationError(
            'Gemini model discovery returned an invalid model resource',
            'malformed_output',
          );
        }
        const model = raw as GeminiModelResource;
        const resourceName = stringValue(model.name);
        if (!resourceName?.startsWith('models/')) {
          throw new GeminiProviderInvocationError(
            'Gemini model discovery returned an invalid model name',
            'malformed_output',
          );
        }
        const modelId = resourceName.slice('models/'.length).trim();
        if (!modelId) {
          throw new GeminiProviderInvocationError(
            'Gemini model discovery returned an empty model id',
            'malformed_output',
          );
        }

        const methods = stringArray(model.supportedGenerationMethods);
        if (!methods.some((method) => method.toLowerCase() === 'generatecontent')) continue;
        if (seen.has(modelId)) continue;
        seen.add(modelId);

        const profile = this.#thinkingProfiles[modelId];
        const thinkingConfigured = profile !== undefined && model.thinking === true;
        const supportedEfforts = thinkingConfigured ? profileEfforts(profile) : [];
        const capabilities: ProviderCapability[] = ['usage_token_breakdown'];
        if (methods.some((method) => method.toLowerCase() === 'counttokens')) {
          capabilities.push('token_counting');
        }
        if (thinkingConfigured) {
          capabilities.push('reasoning_effort');
        }

        const contextWindowTokens = positiveIntegerValue(model.inputTokenLimit);
        const maxOutputTokens = positiveIntegerValue(model.outputTokenLimit);
        models.push({
          modelId,
          displayName: stringValue(model.displayName) ?? modelId,
          capabilities: [...new Set(capabilities)].sort(),
          ...(supportedEfforts.length > 0 ? { supportedEfforts } : {}),
          ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
          ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
          locality: 'REMOTE',
        });
      }

      pageToken = stringValue(parsed.nextPageToken);
    } while (pageToken);

    models.sort((left, right) => left.modelId.localeCompare(right.modelId));
    return models;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.input) {
      throw new GeminiProviderInvocationError('input is required', 'malformed_output');
    }
    const modelId = normalizeModelId(request.model);
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs < 1) {
      throw new GeminiProviderInvocationError('timeoutMs must be positive', 'malformed_output');
    }

    const thinkingConfig = this.#resolveThinkingConfig(modelId, request.effort);
    const startedAtMonoMs = this.#monotonicNow();
    const response = await this.#request(
      `${this.#baseUrl}/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: 'POST',
        headers: this.#requestHeaders(),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: request.input }] }],
          ...(thinkingConfig ? { generationConfig: { thinkingConfig } } : {}),
        }),
      },
      request.timeoutMs,
      'Gemini generateContent',
    );

    const parsed = parseJson<GeminiGenerateContentResponse>(
      response.body,
      'Gemini generateContent',
    );
    const output = parsed.candidates?.[0]?.content?.parts
      ?.filter((part) => part.thought !== true && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');

    if (typeof output !== 'string' || output.length === 0) {
      throw new GeminiProviderInvocationError(
        'Gemini response has no candidate text',
        'malformed_output',
      );
    }

    const usage = mapUsage(parsed.usageMetadata);
    const latency = measureMonotonicDuration(startedAtMonoMs, this.#monotonicNow());
    return {
      output,
      model: modelId,
      ...(usage ? { usage } : {}),
      latencyMs: latency.durationMs,
    };
  }

  async countInputTokens(input: string, model: string): Promise<number> {
    if (!input) throw new GeminiProviderInvocationError('input is required', 'malformed_output');
    const modelId = normalizeModelId(model);
    const response = await this.#request(
      `${this.#baseUrl}/models/${encodeURIComponent(modelId)}:countTokens`,
      {
        method: 'POST',
        headers: this.#requestHeaders(),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input }] }],
        }),
      },
      this.#healthTimeoutMs,
      'Gemini countTokens',
    );
    const parsed = parseJson<GeminiCountTokensResponse>(response.body, 'Gemini countTokens');
    const totalTokens = nonNegativeIntegerValue(parsed.totalTokens);
    if (totalTokens === undefined) {
      throw new GeminiProviderInvocationError(
        'Gemini countTokens response has no valid totalTokens',
        'malformed_output',
      );
    }
    return totalTokens;
  }

  #resolveThinkingConfig(
    modelId: string,
    requested: string | undefined,
  ): Readonly<Record<string, string | number>> | undefined {
    if (requested === undefined) return undefined;

    const normalized = normalizeEffortValue(requested);
    if (normalized === 'default' || normalized === 'none') return undefined;

    const profile = this.#thinkingProfiles[modelId];
    if (!profile) {
      throw new GeminiProviderInvocationError(
        `Gemini model ${modelId} has no configured thinking profile`,
        'malformed_output',
      );
    }

    if (profile.mode === 'LEVEL') {
      let resolution;
      try {
        resolution = resolveProviderEffort(requested, {
          supportedEfforts: profile.supportedEfforts,
          nativeMapping: profile.nativeLevels,
        });
      } catch (error) {
        throw new GeminiProviderInvocationError(
          error instanceof Error ? error.message : 'invalid Gemini thinking level',
          'malformed_output',
        );
      }
      if (resolution.omitted || !resolution.nativeValue) return undefined;
      return { thinkingLevel: resolution.nativeValue.toLowerCase() };
    }

    const budget = profile.budgets[normalized];
    if (!Number.isInteger(budget) || budget === undefined || budget < 0) {
      throw new GeminiProviderInvocationError(
        `unsupported effort: ${normalized}`,
        'malformed_output',
      );
    }
    return { thinkingBudget: budget };
  }

  #requestHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-goog-api-key': this.#apiKey,
      'x-goog-api-client': 'freehighlander/0.0.0',
      ...this.#headers,
    };
  }

  async #request(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    operation: string,
  ): Promise<{ readonly body: string; readonly response: Response }> {
    let response: Response;
    try {
      response = await this.#fetchWithTimeout(url, init, timeoutMs);
    } catch (error) {
      if (isAbortError(error)) {
        throw new GeminiProviderInvocationError(`${operation} timed out`, 'transport_failure');
      }
      throw new GeminiProviderInvocationError(
        error instanceof Error ? error.message : `${operation} transport failed`,
        'transport_failure',
      );
    }

    const body = await response.text();
    if (!response.ok) {
      throw new GeminiProviderInvocationError(
        `${operation} returned HTTP ${response.status}: ${truncate(
          redactSecret(body, this.#apiKey),
          500,
        )}`,
        classifyHttpFailure(response.status, body),
        response.status,
        parseRetryAfterMs(response.headers.get('retry-after')),
      );
    }
    return { body, response };
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

function profileEfforts(profile: GeminiThinkingProfile): string[] {
  if (profile.mode === 'LEVEL') {
    return [...new Set(profile.supportedEfforts.map(normalizeEffortValue))].sort();
  }
  return [...new Set(Object.keys(profile.budgets).map(normalizeEffortValue))].sort();
}

function mapUsage(
  usage: GeminiGenerateContentResponse['usageMetadata'],
): ProviderUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = nonNegativeIntegerValue(usage.promptTokenCount);
  const cachedInputTokens = nonNegativeIntegerValue(usage.cachedContentTokenCount);
  const outputTokens = nonNegativeIntegerValue(usage.candidatesTokenCount);
  const reasoningTokens = nonNegativeIntegerValue(usage.thoughtsTokenCount);
  const totalTokens = nonNegativeIntegerValue(usage.totalTokenCount);

  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function normalizeModelId(value: string): string {
  const trimmed = value.trim();
  const modelId = trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
  if (!modelId) throw new GeminiProviderInvocationError('model is required', 'malformed_output');
  return modelId;
}

function parseJson<T>(value: string, operation: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new GeminiProviderInvocationError(
      `${operation} returned invalid JSON`,
      'malformed_output',
    );
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function positiveIntegerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeIntegerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
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

function redactSecret(value: string, secret: string): string {
  return secret ? value.split(secret).join('[REDACTED]') : value;
}
