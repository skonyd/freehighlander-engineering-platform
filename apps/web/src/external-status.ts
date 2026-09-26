export type ExternalStatusState = 'DISABLED' | 'OK' | 'DEGRADED' | 'UNKNOWN';
export type ExternalCiState = 'PASSING' | 'FAILING' | 'PENDING' | 'UNKNOWN';

export interface ExternalStatusContext {
  readonly repository: string | null;
  readonly exactRevision: string | null;
  readonly pullRequest: number | null;
}

export interface ExternalPullRequestStatusV1 {
  readonly number: number;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN';
  readonly draft: boolean | null;
  readonly htmlUrl: string | null;
}

export interface ExternalCiStatusV1 {
  readonly state: ExternalCiState;
  readonly totalChecks: number;
  readonly successfulChecks: number;
  readonly failedChecks: number;
  readonly pendingChecks: number;
}

export interface ExternalStatusSnapshotV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly source: 'GITHUB';
  readonly authority: 'NONE';
  readonly state: ExternalStatusState;
  readonly repository: string | null;
  readonly exactRevision: string | null;
  readonly pullRequest: ExternalPullRequestStatusV1 | null;
  readonly ci: ExternalCiStatusV1;
  readonly stale: boolean;
  readonly message: string | null;
}

export interface ExternalStatusProvider {
  read(context: ExternalStatusContext): Promise<ExternalStatusSnapshotV1>;
}

export interface GithubExternalStatusProviderOptions {
  readonly enabled?: boolean;
  readonly token?: string;
  readonly apiBase?: string;
  readonly timeoutMs?: number;
  readonly cacheTtlMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly snapshot: ExternalStatusSnapshotV1;
}

export class GithubExternalStatusProvider implements ExternalStatusProvider {
  readonly #enabled: boolean;
  readonly #token?: string;
  readonly #apiBase: string;
  readonly #timeoutMs: number;
  readonly #cacheTtlMs: number;
  readonly #fetchImpl: typeof fetch;
  readonly #now: () => number;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(options: GithubExternalStatusProviderOptions = {}) {
    this.#enabled = options.enabled ?? false;
    const token = normalizeOptionalText(options.token);
    if (token !== undefined) this.#token = token;
    this.#apiBase = (options.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
    this.#timeoutMs = positiveInteger(options.timeoutMs ?? 1_500, 'timeoutMs');
    this.#cacheTtlMs = positiveInteger(options.cacheTtlMs ?? 60_000, 'cacheTtlMs');
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async read(context: ExternalStatusContext): Promise<ExternalStatusSnapshotV1> {
    const generatedAt = new Date(this.#now()).toISOString();

    if (!this.#enabled) {
      return emptySnapshot(generatedAt, context, 'DISABLED', false, 'GitHub status is disabled.');
    }

    if (!isRepository(context.repository) || !isRevision(context.exactRevision)) {
      return emptySnapshot(
        generatedAt,
        context,
        'UNKNOWN',
        false,
        'Repository or exact revision is unavailable.',
      );
    }

    const key = [context.repository, context.exactRevision, context.pullRequest ?? 'none'].join(
      '|',
    );
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAt > this.#now()) return cached.snapshot;

    try {
      const snapshot = await this.#fetchGithub(context, generatedAt);
      this.#cache.set(key, {
        expiresAt: this.#now() + this.#cacheTtlMs,
        snapshot,
      });
      return snapshot;
    } catch {
      const previous = cached?.snapshot;
      if (previous) {
        return {
          ...previous,
          generatedAt,
          stale: true,
          state: 'DEGRADED',
          message: 'GitHub status refresh failed; showing cached deterministic status.',
        };
      }

      return emptySnapshot(
        generatedAt,
        context,
        'UNKNOWN',
        true,
        'GitHub status is temporarily unavailable.',
      );
    }
  }

  async #fetchGithub(
    context: ExternalStatusContext,
    generatedAt: string,
  ): Promise<ExternalStatusSnapshotV1> {
    const repository = context.repository as string;
    const revision = context.exactRevision as string;
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'freehighlander-core-home',
    };
    if (this.#token) headers.authorization = 'Bearer ' + this.#token;

    const checkPath =
      '/repos/' +
      encodeRepository(repository) +
      '/commits/' +
      encodeURIComponent(revision) +
      '/check-runs?per_page=100';
    const checkRunsPromise = this.#requestJson(checkPath, headers);

    const pullPath = '/repos/' + encodeRepository(repository) + '/pulls/' + context.pullRequest;
    const pullPromise =
      context.pullRequest === null ? Promise.resolve(null) : this.#requestJson(pullPath, headers);

    const [checkPayload, pullPayload] = await Promise.all([checkRunsPromise, pullPromise]);
    const ci = projectCi(checkPayload);
    const pullRequest = pullPayload === null ? null : projectPullRequest(pullPayload);

    return {
      schemaVersion: 1,
      generatedAt,
      source: 'GITHUB',
      authority: 'NONE',
      state: ci.state === 'FAILING' ? 'DEGRADED' : 'OK',
      repository,
      exactRevision: revision,
      pullRequest,
      ci,
      stale: false,
      message: null,
    };
  }

  async #requestJson(path: string, headers: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(this.#apiBase + path, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('GitHub API request failed');
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGithubExternalStatusProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GithubExternalStatusProvider {
  const token = normalizeOptionalText(env.GITHUB_TOKEN ?? env.GH_TOKEN);
  const apiBase = normalizeOptionalText(env.FREEHIGHLANDER_GITHUB_API);
  const timeoutMs = parseOptionalInteger(env.FREEHIGHLANDER_GITHUB_TIMEOUT_MS);
  const cacheTtlMs = parseOptionalInteger(env.FREEHIGHLANDER_GITHUB_CACHE_TTL_MS);

  return new GithubExternalStatusProvider({
    enabled: env.FREEHIGHLANDER_GITHUB_STATUS === '1',
    ...(token === undefined ? {} : { token }),
    ...(apiBase === undefined ? {} : { apiBase }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(cacheTtlMs === undefined ? {} : { cacheTtlMs }),
  });
}

export function externalStatusCanInvokeModel(): false {
  return false;
}

export function externalStatusCanGrantAuthority(): false {
  return false;
}

function emptySnapshot(
  generatedAt: string,
  context: ExternalStatusContext,
  state: ExternalStatusState,
  stale: boolean,
  message: string,
): ExternalStatusSnapshotV1 {
  return {
    schemaVersion: 1,
    generatedAt,
    source: 'GITHUB',
    authority: 'NONE',
    state,
    repository: context.repository,
    exactRevision: context.exactRevision,
    pullRequest: null,
    ci: {
      state: 'UNKNOWN',
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      pendingChecks: 0,
    },
    stale,
    message,
  };
}

function projectCi(value: unknown): ExternalCiStatusV1 {
  const record = asRecord(value);
  const checkRuns = Array.isArray(record?.check_runs) ? record.check_runs : [];
  let successfulChecks = 0;
  let failedChecks = 0;
  let pendingChecks = 0;

  for (const item of checkRuns) {
    const check = asRecord(item);
    const status = text(check?.status)?.toLowerCase();
    const conclusion = text(check?.conclusion)?.toLowerCase();

    if (status !== 'completed') {
      pendingChecks += 1;
      continue;
    }

    if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
      successfulChecks += 1;
    } else if (conclusion === null || conclusion === undefined) {
      pendingChecks += 1;
    } else {
      failedChecks += 1;
    }
  }

  const totalChecks = successfulChecks + failedChecks + pendingChecks;
  const state: ExternalCiState =
    failedChecks > 0
      ? 'FAILING'
      : pendingChecks > 0
        ? 'PENDING'
        : totalChecks > 0
          ? 'PASSING'
          : 'UNKNOWN';

  return {
    state,
    totalChecks,
    successfulChecks,
    failedChecks,
    pendingChecks,
  };
}

function projectPullRequest(value: unknown): ExternalPullRequestStatusV1 {
  const record = asRecord(value);
  const number = numberValue(record?.number);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('GitHub PR response missing number');
  }

  const merged = record?.merged === true;
  const rawState = text(record?.state)?.toLowerCase();
  const state: ExternalPullRequestStatusV1['state'] = merged
    ? 'MERGED'
    : rawState === 'open'
      ? 'OPEN'
      : rawState === 'closed'
        ? 'CLOSED'
        : 'UNKNOWN';

  return {
    number,
    state,
    draft: typeof record?.draft === 'boolean' ? record.draft : null,
    htmlUrl: safeGithubUrl(text(record?.html_url)),
  };
}

function safeGithubUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.toString() : null;
  } catch {
    return null;
  }
}

function encodeRepository(repository: string): string {
  return repository
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function isRepository(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isRevision(value: string | null): value is string {
  return value !== null && /^[A-Fa-f0-9]{7,64}$/.test(value);
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 600_000) {
    throw new Error(field + ' must be an integer between 1 and 600000');
  }
  return value;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return positiveInteger(parsed, 'environment timeout/cache value');
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}
