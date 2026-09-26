import {
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaCanonicalWorkflowNodeV1,
} from './kuika-workflow-draft.js';

export type FhKuikaWorkflowInspectorRiskTier = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface FhKuikaWorkflowNodeInspectorV1 {
  readonly nodeId: string;
  readonly logicalRole: string | null;
  readonly riskTier: FhKuikaWorkflowInspectorRiskTier;
  readonly timeoutMs: number | null;
  readonly retryLimit: number;
  readonly tokenBudget: number | null;
  readonly costBudgetUsd: number | null;
  readonly timeBudgetMs: number | null;
  readonly requiredEvidence: readonly string[];
  readonly toolPermissions: readonly string[];
  readonly sandboxPolicyRef: string | null;
  readonly approvalPolicy: 'NONE' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED';
  readonly authority: 'NONE';
  readonly runtimeAuthoritative: false;
}

export interface FhKuikaWorkflowValidationIssueV1 {
  readonly category:
    | 'SCHEMA'
    | 'GRAPH'
    | 'REFERENCE'
    | 'LOOP_BOUND'
    | 'AUTHORITY'
    | 'ROLE'
    | 'BUDGET'
    | 'EVIDENCE'
    | 'SANDBOX';
  readonly severity: 'ERROR' | 'WARNING';
  readonly message: string;
  readonly nodeId: string | null;
}

export interface FhKuikaWorkflowValidationViewV1 {
  readonly valid: boolean;
  readonly issues: readonly FhKuikaWorkflowValidationIssueV1[];
  readonly canonicalPublishValidationRequired: true;
  readonly authority: 'NONE';
}

export interface FhKuikaWorkflowSimulationPreviewNodeV1 {
  readonly nodeId: string;
  readonly kind: FhKuikaCanonicalWorkflowNodeV1['kind'];
  readonly state: 'NOT_EXECUTED';
}

export interface FhKuikaWorkflowSimulationPreviewV1 {
  readonly schemaVersion: 1;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly valid: boolean;
  readonly nodes: readonly FhKuikaWorkflowSimulationPreviewNodeV1[];
  readonly validationIssues: readonly FhKuikaWorkflowValidationIssueV1[];
  readonly requiresCoreReplaySimulation: true;
  readonly executionAuthorized: false;
  readonly authority: 'NONE';
}

export function createFhKuikaWorkflowNodeInspectorV1(input: {
  readonly node: FhKuikaCanonicalWorkflowNodeV1;
  readonly logicalRole?: string | null;
  readonly riskTier?: FhKuikaWorkflowInspectorRiskTier;
  readonly timeoutMs?: number | null;
  readonly retryLimit?: number;
  readonly tokenBudget?: number | null;
  readonly costBudgetUsd?: number | null;
  readonly timeBudgetMs?: number | null;
  readonly requiredEvidence?: readonly string[];
  readonly toolPermissions?: readonly string[];
  readonly sandboxPolicyRef?: string | null;
  readonly approvalPolicy?: 'NONE' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED';
}): FhKuikaWorkflowNodeInspectorV1 {
  const retryLimit = input.retryLimit ?? 0;
  requireNonNegativeInteger(retryLimit, 'retryLimit');
  validateNullablePositiveInteger(input.timeoutMs, 'timeoutMs');
  validateNullablePositiveInteger(input.tokenBudget, 'tokenBudget');
  validateNullablePositiveInteger(input.timeBudgetMs, 'timeBudgetMs');
  validateNullableNonNegativeFinite(input.costBudgetUsd, 'costBudgetUsd');

  const riskTier = input.riskTier ?? 'NORMAL';
  const approvalPolicy = input.approvalPolicy ?? 'NONE';

  if (riskTier === 'CRITICAL' && approvalPolicy === 'NONE') {
    throw new Error('CRITICAL inspector annotations require an explicit approval policy');
  }

  return {
    nodeId: requireSingleLine(input.node.id, 'nodeId'),
    logicalRole: normalizeNullableSingleLine(input.logicalRole ?? input.node.role ?? null, 'logicalRole'),
    riskTier,
    timeoutMs: input.timeoutMs ?? null,
    retryLimit,
    tokenBudget: input.tokenBudget ?? null,
    costBudgetUsd: input.costBudgetUsd ?? null,
    timeBudgetMs: input.timeBudgetMs ?? null,
    requiredEvidence: normalizeList(input.requiredEvidence ?? [], 'requiredEvidence'),
    toolPermissions: normalizeList(input.toolPermissions ?? [], 'toolPermissions'),
    sandboxPolicyRef: normalizeNullableSingleLine(input.sandboxPolicyRef ?? null, 'sandboxPolicyRef'),
    approvalPolicy,
    authority: 'NONE',
    runtimeAuthoritative: false,
  };
}

export function buildFhKuikaWorkflowValidationViewV1(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
  inspectors: readonly FhKuikaWorkflowNodeInspectorV1[] = [],
): FhKuikaWorkflowValidationViewV1 {
  const canonical = validateFhKuikaWorkflowDraftDefinitionV1(definition);
  const issues: FhKuikaWorkflowValidationIssueV1[] = canonical.errors.map((message) => ({
    category: classifyCanonicalError(message),
    severity: 'ERROR',
    message,
    nodeId: nodeIdFromMessage(message, definition),
  }));

  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  const inspectorIds = new Set<string>();

  for (const inspector of inspectors) {
    if (inspectorIds.has(inspector.nodeId)) {
      issues.push({
        category: 'REFERENCE',
        severity: 'ERROR',
        message: 'duplicate inspector annotation for node: ' + inspector.nodeId,
        nodeId: inspector.nodeId,
      });
      continue;
    }
    inspectorIds.add(inspector.nodeId);

    if (!nodeIds.has(inspector.nodeId)) {
      issues.push({
        category: 'REFERENCE',
        severity: 'ERROR',
        message: 'inspector annotation references unknown node: ' + inspector.nodeId,
        nodeId: inspector.nodeId,
      });
    }

    if (
      (inspector.riskTier === 'HIGH' || inspector.riskTier === 'CRITICAL') &&
      inspector.requiredEvidence.length === 0
    ) {
      issues.push({
        category: 'EVIDENCE',
        severity: 'WARNING',
        message: inspector.riskTier + ' risk node has no inspector evidence annotation',
        nodeId: inspector.nodeId,
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== 'ERROR'),
    issues,
    canonicalPublishValidationRequired: true,
    authority: 'NONE',
  };
}

export function buildFhKuikaWorkflowSimulationPreviewV1(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
  inspectors: readonly FhKuikaWorkflowNodeInspectorV1[] = [],
): FhKuikaWorkflowSimulationPreviewV1 {
  const validation = buildFhKuikaWorkflowValidationViewV1(definition, inspectors);

  return {
    schemaVersion: 1,
    workflowId: definition.id,
    workflowVersion: definition.version,
    valid: validation.valid,
    nodes: topologicalNodeOrder(definition).map((node) => ({
      nodeId: node.id,
      kind: node.kind,
      state: 'NOT_EXECUTED' as const,
    })),
    validationIssues: validation.issues,
    requiresCoreReplaySimulation: true,
    executionAuthorized: false,
    authority: 'NONE',
  };
}

export function workflowInspectorAnnotationsCanGrantAuthority(): false {
  return false;
}

export function workflowSimulationPreviewCanExecute(): false {
  return false;
}

export function workflowValidationViewCanPublishDirectly(): false {
  return false;
}

function topologicalNodeOrder(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): readonly FhKuikaCanonicalWorkflowNodeV1[] {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const indegree = new Map(definition.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of definition.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = definition.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const ordered: FhKuikaCanonicalWorkflowNodeV1[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) ordered.push(node);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }

  if (ordered.length !== definition.nodes.length) {
    return [...definition.nodes].sort((left, right) => left.id.localeCompare(right.id));
  }
  return ordered;
}

function classifyCanonicalError(message: string): FhKuikaWorkflowValidationIssueV1['category'] {
  if (message.includes('LOOP') || message.includes('maxIterations')) return 'LOOP_BOUND';
  if (message.includes('edge') || message.includes('cycle') || message.includes('acyclic')) return 'GRAPH';
  if (message.includes('unknown')) return 'REFERENCE';
  return 'SCHEMA';
}

function nodeIdFromMessage(
  message: string,
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): string | null {
  return definition.nodes.find((node) => message.includes(node.id))?.id ?? null;
}

function normalizeList(values: readonly string[], field: string): readonly string[] {
  const result = new Set(values.map((value) => requireSingleLine(value, field + ' item')));
  return [...result].sort();
}

function normalizeNullableSingleLine(value: string | null, field: string): string | null {
  if (value === null) return null;
  return requireSingleLine(value, field);
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (/[\r\n\t]/.test(normalized) || normalized.length > 500) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer');
  }
}

function validateNullablePositiveInteger(value: number | null | undefined, field: string): void {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(field + ' must be a positive integer when provided');
  }
}

function validateNullableNonNegativeFinite(
  value: number | null | undefined,
  field: string,
): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(field + ' must be a non-negative finite number when provided');
  }
}
