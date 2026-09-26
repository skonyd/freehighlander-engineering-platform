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

export function createFhKuikaWorkbenchIntentV1(input: {
  readonly mode: FhKuikaWorkbenchIntentMode;
  readonly request: string;
  readonly context: FhKuikaWorkbenchIntentContextV1;
  readonly v3Authority: 'SHADOW_ONLY' | 'ENABLED' | 'UNKNOWN';
}): FhKuikaWorkbenchIntentV1 {
  const request = requireText(input.request, 'request');
  const repository = requireText(input.context.repository, 'context.repository');
  const selectedFiles = normalizeIdentifiers(input.context.selectedFiles, 'selectedFiles');
  const evidenceIds = normalizeIdentifiers(input.context.evidenceIds, 'evidenceIds');

  if (input.mode === 'REVIEW') {
    if (!input.context.exactRevision?.trim()) {
      throw new Error('REVIEW requires an exact revision');
    }
    if (evidenceIds.length === 0) {
      throw new Error('REVIEW requires at least one evidence id');
    }
  }

  if (input.mode === 'EXECUTE' && input.v3Authority !== 'ENABLED') {
    throw new Error('EXECUTE requires ENABLED V3 authority');
  }

  return {
    schemaVersion: 1,
    mode: input.mode,
    disposition: dispositionForMode(input.mode),
    request,
    context: {
      repository,
      branch: normalizeOptionalText(input.context.branch),
      exactRevision: normalizeOptionalText(input.context.exactRevision),
      selectedFiles,
      evidenceIds,
      blueprintId: normalizeOptionalText(input.context.blueprintId),
      workflowId: normalizeOptionalText(input.context.workflowId),
    },
    selectionAuthority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
    canInvokeModelOnPrepare: false,
    canGrantAuthority: false,
    mutationRequested: input.mode === 'EXECUTE',
    requiresEnabledV3Authority: input.mode === 'EXECUTE',
  };
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
