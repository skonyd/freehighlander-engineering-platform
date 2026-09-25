const DELTA_SECONDS_PATTERN = /^\d+(?:\.\d+)?$/;
const HTTP_DATE_PATTERN =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

export function parseProviderRetryAfterMs(
  value: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  if (!Number.isFinite(nowMs)) throw new Error('retry-after nowMs must be finite');

  const normalized = value.trim();
  if (!normalized) return undefined;

  if (DELTA_SECONDS_PATTERN.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isFinite(seconds)) return undefined;
    return Math.round(seconds * 1_000);
  }

  if (!HTTP_DATE_PATTERN.test(normalized)) return undefined;
  const resetMs = Date.parse(normalized);
  if (Number.isNaN(resetMs)) return undefined;
  return Math.max(0, Math.round(resetMs - nowMs));
}

export function retryAfterParserCanGrantAuthority(): false {
  return false;
}
