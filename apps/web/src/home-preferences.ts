export type CoreHomeAttentionFilter = 'ALL' | 'WARNING_PLUS' | 'ERROR_PLUS' | 'CRITICAL';
export type CoreHomeTimeWindow = 'TODAY' | 'LAST_24H' | 'LAST_7D';

export interface CoreHomeUiPreferencesV1 {
  readonly schemaVersion: 1;
  readonly attentionFilter: CoreHomeAttentionFilter;
  readonly timeWindow: CoreHomeTimeWindow;
  readonly advancedOpen: boolean;
}

export const DEFAULT_CORE_HOME_UI_PREFERENCES: CoreHomeUiPreferencesV1 = {
  schemaVersion: 1,
  attentionFilter: 'ALL',
  timeWindow: 'TODAY',
  advancedOpen: false,
};

const ATTENTION_FILTERS = new Set<CoreHomeAttentionFilter>([
  'ALL',
  'WARNING_PLUS',
  'ERROR_PLUS',
  'CRITICAL',
]);
const TIME_WINDOWS = new Set<CoreHomeTimeWindow>(['TODAY', 'LAST_24H', 'LAST_7D']);

export function parseCoreHomeUiPreferences(value: unknown): CoreHomeUiPreferencesV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_CORE_HOME_UI_PREFERENCES };
  }

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return { ...DEFAULT_CORE_HOME_UI_PREFERENCES };
  }

  const attentionFilter = ATTENTION_FILTERS.has(record.attentionFilter as CoreHomeAttentionFilter)
    ? (record.attentionFilter as CoreHomeAttentionFilter)
    : DEFAULT_CORE_HOME_UI_PREFERENCES.attentionFilter;
  const timeWindow = TIME_WINDOWS.has(record.timeWindow as CoreHomeTimeWindow)
    ? (record.timeWindow as CoreHomeTimeWindow)
    : DEFAULT_CORE_HOME_UI_PREFERENCES.timeWindow;

  return {
    schemaVersion: 1,
    attentionFilter,
    timeWindow,
    advancedOpen:
      typeof record.advancedOpen === 'boolean'
        ? record.advancedOpen
        : DEFAULT_CORE_HOME_UI_PREFERENCES.advancedOpen,
  };
}

export function serializeCoreHomeUiPreferences(value: CoreHomeUiPreferencesV1): string {
  const normalized = parseCoreHomeUiPreferences(value);
  return JSON.stringify({
    schemaVersion: 1,
    attentionFilter: normalized.attentionFilter,
    timeWindow: normalized.timeWindow,
    advancedOpen: normalized.advancedOpen,
  });
}

export function coreHomeAttentionSeverityVisible(
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  filter: CoreHomeAttentionFilter,
): boolean {
  const rank = { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 } as const;
  const threshold = {
    ALL: 0,
    WARNING_PLUS: 1,
    ERROR_PLUS: 2,
    CRITICAL: 3,
  } as const;
  return rank[severity] >= threshold[filter];
}

export function coreHomeTimestampInWindow(
  timestamp: string,
  window: CoreHomeTimeWindow,
  nowMs: number,
): boolean {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value) || !Number.isFinite(nowMs)) return false;

  if (window === 'LAST_24H') return value >= nowMs - 24 * 60 * 60 * 1000;
  if (window === 'LAST_7D') return value >= nowMs - 7 * 24 * 60 * 60 * 1000;

  const now = new Date(nowMs);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return value >= start;
}

export function coreHomeUiPreferencesCanGrantAuthority(): false {
  return false;
}

export function coreHomeUiPreferencesCanInvokeModel(): false {
  return false;
}
