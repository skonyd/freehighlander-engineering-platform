export type FhKuikaPlanCandidateStatus = 'DRAFT' | 'READY' | 'BLOCKED';

export interface FhKuikaPlanAcceptanceCriterionV1 {
  readonly id: string;
  readonly text: string;
}

export interface FhKuikaPlanWorkItemV1 {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface FhKuikaPlanBlockerV1 {
  readonly id: string;
  readonly reason: string;
}

export interface FhKuikaPlanBlueprintSuggestionV1 {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly reason: string;
  readonly confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface FhKuikaPlanCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly title: string;
  readonly repository: string;
  readonly exactRevision: string;
  readonly status: FhKuikaPlanCandidateStatus;
  readonly acceptanceCriteria: readonly FhKuikaPlanAcceptanceCriterionV1[];
  readonly workItems: readonly FhKuikaPlanWorkItemV1[];
  readonly blockers: readonly FhKuikaPlanBlockerV1[];
  readonly blueprintSuggestions: readonly FhKuikaPlanBlueprintSuggestionV1[];
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export interface FhKuikaPlanCandidateValidationV1 {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateFhKuikaPlanCandidateV1(
  candidate: FhKuikaPlanCandidateV1,
): FhKuikaPlanCandidateValidationV1 {
  const errors: string[] = [];

  if (candidate.schemaVersion !== 1) errors.push('unsupported schemaVersion');
  requireText(candidate.candidateId, 'candidateId', errors);
  requireText(candidate.title, 'title', errors);
  requireText(candidate.repository, 'repository', errors);
  requireText(candidate.exactRevision, 'exactRevision', errors);

  if (candidate.authority !== 'NONE') errors.push('candidate authority must be NONE');
  if (candidate.executionAuthorized !== false) {
    errors.push('candidate executionAuthorized must be false');
  }

  const criterionIds = uniqueIds(
    candidate.acceptanceCriteria.map((item) => item.id),
    'acceptance criterion',
    errors,
  );
  for (const criterion of candidate.acceptanceCriteria) {
    requireText(criterion.id, 'acceptance criterion id', errors);
    requireText(criterion.text, 'acceptance criterion text', errors);
  }

  const workItemIds = uniqueIds(
    candidate.workItems.map((item) => item.id),
    'work item',
    errors,
  );
  for (const item of candidate.workItems) {
    requireText(item.id, 'work item id', errors);
    requireText(item.title, 'work item title', errors);

    for (const dependency of item.dependsOn) {
      if (dependency === item.id) errors.push(`work item ${item.id} cannot depend on itself`);
      if (!workItemIds.has(dependency)) {
        errors.push(`work item ${item.id} has unknown dependency ${dependency}`);
      }
    }

    for (const criterionId of item.acceptanceCriteria) {
      if (!criterionIds.has(criterionId)) {
        errors.push(`work item ${item.id} references unknown acceptance criterion ${criterionId}`);
      }
    }
  }

  detectCycle(candidate.workItems, workItemIds, errors);

  uniqueIds(
    candidate.blockers.map((item) => item.id),
    'blocker',
    errors,
  );
  for (const blocker of candidate.blockers) {
    requireText(blocker.id, 'blocker id', errors);
    requireText(blocker.reason, 'blocker reason', errors);
  }

  const blueprintKeys = new Set<string>();
  for (const suggestion of candidate.blueprintSuggestions) {
    requireText(suggestion.blueprintId, 'blueprintId', errors);
    requireSemver(suggestion.blueprintVersion, 'blueprintVersion', errors);
    requireText(suggestion.reason, 'blueprint reason', errors);
    const key = suggestion.blueprintId + '@' + suggestion.blueprintVersion;
    if (blueprintKeys.has(key)) errors.push(`duplicate blueprint suggestion: ${key}`);
    blueprintKeys.add(key);
  }

  if (candidate.status === 'READY') {
    if (candidate.acceptanceCriteria.length === 0) {
      errors.push('READY candidate requires acceptance criteria');
    }
    if (candidate.workItems.length === 0) errors.push('READY candidate requires work items');
    if (candidate.blockers.length > 0) errors.push('READY candidate cannot retain blockers');
  }

  if (candidate.status === 'BLOCKED' && candidate.blockers.length === 0) {
    errors.push('BLOCKED candidate requires at least one blocker');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createFhKuikaPlanCandidateV1(
  input: Omit<FhKuikaPlanCandidateV1, 'schemaVersion' | 'authority' | 'executionAuthorized'>,
): FhKuikaPlanCandidateV1 {
  const candidate: FhKuikaPlanCandidateV1 = {
    schemaVersion: 1,
    ...input,
    authority: 'NONE',
    executionAuthorized: false,
  };
  const validation = validateFhKuikaPlanCandidateV1(candidate);
  if (!validation.valid) {
    throw new Error(`invalid FH-KUIKA plan candidate: ${validation.errors.join('; ')}`);
  }
  return candidate;
}

export function fhKuikaPlanCandidateCanGrantAuthority(): false {
  return false;
}

export function fhKuikaPlanCandidateCanAuthorizeExecution(): false {
  return false;
}

function uniqueIds(values: readonly string[], kind: string, errors: string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (!value.trim()) continue;
    if (result.has(value)) errors.push(`duplicate ${kind} id: ${value}`);
    result.add(value);
  }
  return result;
}

function detectCycle(
  items: readonly FhKuikaPlanWorkItemV1[],
  knownIds: ReadonlySet<string>,
  errors: string[],
): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (knownIds.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of knownIds) {
    if (visit(id)) {
      errors.push('work item dependency graph must be acyclic');
      return;
    }
  }
}

function requireText(value: string, name: string, errors: string[]): void {
  if (!value.trim()) errors.push(`${name} is required`);
}

function requireSemver(value: string, name: string, errors: string[]): void {
  if (!/^\d+\.\d+\.\d+$/.test(value)) errors.push(`${name} must be semantic version`);
}
