export function parseProviderRetryAfterMs(
  value: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  if (!Number.isFinite(nowMs)) throw new Error('retry-after nowMs must be finite');

  const normalized = value.trim();
  if (!normalized) return undefined;

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const resetMs = Date.parse(normalized);
  if (Number.isNaN(resetMs)) return undefined;
  return Math.max(0, Math.round(resetMs - nowMs));
}

export function retryAfterParserCanGrantAuthority(): false {
  return false;
}
