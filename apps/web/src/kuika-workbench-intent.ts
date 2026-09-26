export type FhKuikaWorkbenchIntentMode = 'ASK' | 'PLAN' | 'EXECUTE' | 'REVIEW';

export type FhKuikaWorkbenchIntentDisposition =
  | 'READ_ONLY_QUERY'
  | 'CANDIDATE_PLAN'
  | 'CONTROL_PLANE_REQUEST'
  | 'INDEPENDENT_REVIEW_REQUEST';

export interface FhKuikaWorkbenchContextV1 {
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
  readonly context: FhKuikaWorkbenchContextV1;
  readonly selectionAuthority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
  readonly canInvokeModelOnPrepare: false;
  readonly canGrantAuthority: false;
  readonly mutationRequested: boolean;
  readonly requiresEnabledV3Authority: boolean;
}

export interface FhKuikaPlanCandidateWorkItemV1 {
  readonly id: string;
  readonly title: string;
  readonly kind: 'REQUIREMENT' | 'TASK' | 'ADR_CANDIDATE' | 'BLUEPRINT_PARAMETERS';
  readonly detail: string;
  readonly authority: 'NONE';
}

export interface FhKuikaPlanCandidateV1 {
  readonly schemaVersion: 1;
  readonly exactRevision: string | null;
  readonly items: readonly FhKuikaPlanCandidateWorkItemV1[];
  readonly authority: 'NONE';
  readonly publishableDirectly: false;
}

export function createFhKuikaWorkbenchIntentV1(input: {
  readonly mode: FhKuikaWorkbenchIntentMode;
  readonly request: string;
  readonly context: FhKuikaWorkbenchContextV1;
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

export function createFhKuikaPlanCandidateV1(input: {
  readonly exactRevision: string | null;
  readonly items: readonly Omit<FhKuikaPlanCandidateWorkItemV1, 'authority'>[];
}): FhKuikaPlanCandidateV1 {
  const ids = new Set<string>();
  const items = input.items.map((item) => {
    const id = requireText(item.id, 'plan item id');
    if (ids.has(id)) throw new Error('plan item ids must be unique');
    ids.add(id);

    return {
      id,
      title: requireText(item.title, 'plan item title'),
      kind: item.kind,
      detail: requireText(item.detail, 'plan item detail'),
      authority: 'NONE' as const,
    };
  });

  return {
    schemaVersion: 1,
    exactRevision: normalizeOptionalText(input.exactRevision),
    items,
    authority: 'NONE',
    publishableDirectly: false,
  };
}

export function workbenchIntentPreparationCanInvokeModel(): false {
  return false;
}

export function workbenchIntentPreparationCanGrantAuthority(): false {
  return false;
}

export function workbenchPlanCandidateCanPublishDirectly(): false {
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
  return normalized ? normalized : null;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (normalized.length > 10_000) throw new Error(field + ' exceeds maximum length');
  return normalized;
}
