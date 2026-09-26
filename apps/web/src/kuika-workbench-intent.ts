export type FhKuikaWorkbenchIntentMode = 'ASK' | 'PLAN' | 'EXECUTE' | 'REVIEW';

export type FhKuikaWorkbenchIntentDisposition =
  'READ_ONLY_QUERY' | 'CANDIDATE_PLAN' | 'CONTROL_PLANE_REQUEST' | 'INDEPENDENT_REVIEW_REQUEST';

export interface FhKuikaWorkbenchIntentContextV1 {
  readonly repository: string;
  readonly branch: string | null;
  readonly exactRevision: string | null;
  readonly selectedFiles: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly blueprintId: string | null;
  readonly workflowId: string | null;
}

export interface FhKuikaWorkbenchIntentV1 {
  readonly schemaVersion: 1;
  readonly mode: FhKuikaWorkbenchIntentMode;
  readonly disposition: FhKuikaWorkbenchIntentDisposition;
  readonly request: string;
  readonly context: FhKuikaWorkbenchIntentContextV1;
  readonly selectionAuthority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
  readonly canInvokeModelOnPrepare: false;
  readonly canGrantAuthority: false;
  readonly mutationRequested: boolean;
  readonly requiresEnabledV3Authority: boolean;
}

export function workbenchIntentPreparationCanInvokeModel(): false {
  return false;
}

export function workbenchIntentPreparationCanGrantAuthority(): false {
  return false;
}

function dispositionForMode(mode: FhKuikaWorkbenchIntentMode): FhKuikaWorkbenchIntentDisposition {
  switch (mode) {
    case 'ASK':
      return 'READ_ONLY_QUERY';
    case 'PLAN':
      return 'CANDIDATE_PLAN';
    case 'EXECUTE':
      return 'CONTROL_PLANE_REQUEST';
    case 'REVIEW':
      return 'INDEPENDENT_REVIEW_REQUEST';
  }
}

function normalizeIdentifiers(values: readonly string[], field: string): readonly string[] {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = requireText(value, field + ' item');
    if (/[\r\n\t]/.test(normalized) || normalized.length > 500) {
      throw new Error(field + ' items must be bounded single-line identifiers');
    }
    result.add(normalized);
  }
  return [...result].sort();
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (normalized.length > 10_000) throw new Error(field + ' exceeds maximum length');
  return normalized;
}
