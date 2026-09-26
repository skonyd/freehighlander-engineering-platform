export type FhKuikaWorkflowNodeKind =
  | 'MODEL'
  | 'COMMAND'
  | 'GATE'
  | 'CONDITION'
  | 'PARALLEL'
  | 'AGGREGATE'
  | 'DEBATE'
  | 'LOOP'
  | 'HUMAN'
  | 'SUBWORKFLOW';

export type FhKuikaWorkflowRiskTier = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type FhKuikaWorkflowApprovalPolicy = 'NONE' | 'MODEL_QUORUM_REQUIRED' | 'HUMAN_REQUIRED';

export interface FhKuikaCanonicalWorkflowNodeV1 {
  readonly id: string;
  readonly kind: FhKuikaWorkflowNodeKind;
  readonly role?: string;
  readonly riskTier?: FhKuikaWorkflowRiskTier;
  readonly timeoutMs?: number;
  readonly retryLimit?: number;
  readonly tokenBudget?: number;
  readonly costBudgetUsd?: number;
  readonly requiredEvidence?: readonly string[];
  readonly toolPermissions?: readonly string[];
  readonly approvalPolicy?: FhKuikaWorkflowApprovalPolicy;
  readonly maxIterations?: number;
}

export interface FhKuikaCanonicalWorkflowEdgeV1 {
  readonly from: string;
  readonly to: string;
}

export interface FhKuikaCanonicalWorkflowDefinitionV1 {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly FhKuikaCanonicalWorkflowNodeV1[];
  readonly edges: readonly FhKuikaCanonicalWorkflowEdgeV1[];
}

export interface FhKuikaWorkflowDraftV1 {
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly canonicalDefinition: FhKuikaCanonicalWorkflowDefinitionV1;
  readonly status: 'DRAFT';
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
  readonly executionAuthorized: false;
}

export type FhKuikaWorkflowValidationCategory =
  | 'SCHEMA'
  | 'GRAPH'
  | 'REFERENCE'
  | 'LOOP_BOUND'
  | 'ROLE'
  | 'BUDGET'
  | 'EVIDENCE'
  | 'TOOL_PERMISSION'
  | 'POLICY';

export interface FhKuikaWorkflowValidationIssueV1 {
  readonly category: FhKuikaWorkflowValidationCategory;
  readonly message: string;
  readonly nodeId: string | null;
  readonly edgeRef: string | null;
}

export interface FhKuikaWorkflowDraftValidationV1 {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly issues: readonly FhKuikaWorkflowValidationIssueV1[];
  readonly requiresCanonicalPublishValidation: true;
}

const NODE_KINDS = new Set<FhKuikaWorkflowNodeKind>([
  'MODEL',
  'COMMAND',
  'GATE',
  'CONDITION',
  'PARALLEL',
  'AGGREGATE',
  'DEBATE',
  'LOOP',
  'HUMAN',
  'SUBWORKFLOW',
]);

export function createFhKuikaWorkflowDraftV1(input: {
  readonly draftId: string;
  readonly canonicalDefinition: FhKuikaCanonicalWorkflowDefinitionV1;
}): FhKuikaWorkflowDraftV1 {
  requireText(input.draftId, 'draftId');
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(input.canonicalDefinition);
  if (!validation.valid) {
    throw new Error(`invalid FH-KUIKA workflow draft: ${validation.errors.join('; ')}`);
  }

  return {
    schemaVersion: 1,
    draftId: input.draftId,
    canonicalDefinition: cloneDefinition(input.canonicalDefinition),
    status: 'DRAFT',
    authority: 'NONE',
    publishAuthorized: false,
    executionAuthorized: false,
  };
}

export function validateFhKuikaWorkflowDraftDefinitionV1(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowDraftValidationV1 {
  const errors: string[] = [];
  requireText(definition.id, 'workflow id', errors);
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    errors.push('workflow version must be semantic version x.y.z');
  }
  if (definition.nodes.length === 0) errors.push('workflow must contain at least one node');

  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    requireText(node.id, 'workflow node id', errors);
    if (nodeIds.has(node.id)) errors.push(`duplicate workflow node id: ${node.id}`);
    nodeIds.add(node.id);

    if (!NODE_KINDS.has(node.kind)) errors.push(`unknown workflow node kind: ${node.kind}`);
    if (node.role !== undefined && !node.role.trim()) {
      errors.push(`workflow node ${node.id} role cannot be empty`);
    }
    if (
      node.riskTier !== undefined &&
      !['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(node.riskTier)
    ) {
      errors.push(`workflow node ${node.id} has invalid riskTier`);
    }
    validateOptionalInteger(
      node.timeoutMs,
      `workflow node ${node.id} timeoutMs`,
      1,
      86_400_000,
      errors,
    );
    validateOptionalInteger(node.retryLimit, `workflow node ${node.id} retryLimit`, 0, 20, errors);
    validateOptionalInteger(
      node.tokenBudget,
      `workflow node ${node.id} tokenBudget`,
      1,
      10_000_000,
      errors,
    );
    validateOptionalNumber(
      node.costBudgetUsd,
      `workflow node ${node.id} costBudgetUsd`,
      0,
      100_000,
      errors,
    );
    validateStringList(node.requiredEvidence, `workflow node ${node.id} requiredEvidence`, errors);
    validateStringList(node.toolPermissions, `workflow node ${node.id} toolPermissions`, errors);
    if (
      node.approvalPolicy !== undefined &&
      !['NONE', 'MODEL_QUORUM_REQUIRED', 'HUMAN_REQUIRED'].includes(node.approvalPolicy)
    ) {
      errors.push(`workflow node ${node.id} has invalid approvalPolicy`);
    }

    if (node.kind === 'LOOP') {
      if (!Number.isInteger(node.maxIterations) || (node.maxIterations ?? 0) < 1) {
        errors.push(`LOOP node ${node.id} must define maxIterations >= 1`);
      }
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`unknown workflow edge source: ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`unknown workflow edge target: ${edge.to}`);
    if (edge.from === edge.to) errors.push(`workflow self-cycle is forbidden: ${edge.from}`);
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) errors.push(`duplicate workflow edge: ${key}`);
    edgeKeys.add(key);
  }

  if (!hasCycle(definition.nodes, definition.edges)) {
    return {
      valid: errors.length === 0,
      errors,
      issues: errors.map(classifyValidationError),
      requiresCanonicalPublishValidation: true,
    };
  }

  errors.push('workflow graph must be acyclic');
  return {
    valid: false,
    errors,
    issues: errors.map(classifyValidationError),
    requiresCanonicalPublishValidation: true,
  };
}

export function serializeFhKuikaWorkflowDraftV1(draft: FhKuikaWorkflowDraftV1): string {
  return JSON.stringify(draft);
}

export function parseFhKuikaWorkflowDraftV1(serialized: string): FhKuikaWorkflowDraftV1 {
  if (!serialized.trim()) throw new Error('workflow draft payload is required');

  const raw = JSON.parse(serialized) as Partial<FhKuikaWorkflowDraftV1>;
  if (raw.schemaVersion !== 1) throw new Error('workflow draft schemaVersion must be 1');
  if (raw.status !== 'DRAFT') throw new Error('workflow draft status must be DRAFT');
  if (raw.authority !== 'NONE') throw new Error('workflow draft authority must be NONE');
  if (raw.publishAuthorized !== false) {
    throw new Error('workflow draft publishAuthorized must be false');
  }
  if (raw.executionAuthorized !== false) {
    throw new Error('workflow draft executionAuthorized must be false');
  }
  if (typeof raw.draftId !== 'string' || !raw.canonicalDefinition) {
    throw new Error('workflow draft identity and canonicalDefinition are required');
  }

  return createFhKuikaWorkflowDraftV1({
    draftId: raw.draftId,
    canonicalDefinition: raw.canonicalDefinition,
  });
}

export function workflowStudioDraftCanGrantAuthority(): false {
  return false;
}

export function workflowStudioDraftCanPublishDirectly(): false {
  return false;
}

export function workflowStudioDraftCanExecute(): false {
  return false;
}

function cloneDefinition(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaCanonicalWorkflowDefinitionV1 {
  return {
    id: definition.id,
    version: definition.version,
    nodes: definition.nodes.map((node) => ({
      ...node,
      ...(node.requiredEvidence ? { requiredEvidence: [...node.requiredEvidence] } : {}),
      ...(node.toolPermissions ? { toolPermissions: [...node.toolPermissions] } : {}),
    })),
    edges: definition.edges.map((edge) => ({ ...edge })),
  };
}

function hasCycle(
  nodes: readonly FhKuikaCanonicalWorkflowNodeV1[],
  edges: readonly FhKuikaCanonicalWorkflowEdgeV1[],
): boolean {
  const known = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return visited !== nodes.length;
}

// Validation issue projection is descriptive only and cannot grant execution or publish authority.
function classifyValidationError(message: string): FhKuikaWorkflowValidationIssueV1 {
  const nodeMatch = /(?:workflow node|LOOP node) ([A-Za-z0-9._-]+)/.exec(message);
  const edgeMatch = /(?:duplicate workflow edge: )([A-Za-z0-9._-]+->[A-Za-z0-9._-]+)/.exec(message);
  const edgeEndpointMatch = /unknown workflow edge (?:source|target): ([A-Za-z0-9._-]+)/.exec(
    message,
  );

  let category: FhKuikaWorkflowValidationCategory = 'SCHEMA';
  if (/edge|acyclic|cycle|duplicate workflow node/.test(message)) category = 'GRAPH';
  if (/unknown workflow edge/.test(message)) category = 'REFERENCE';
  if (/maxIterations/.test(message)) category = 'LOOP_BOUND';
  if (/role/.test(message)) category = 'ROLE';
  if (/timeoutMs|retryLimit|tokenBudget|costBudgetUsd/.test(message)) category = 'BUDGET';
  if (/requiredEvidence/.test(message)) category = 'EVIDENCE';
  if (/toolPermissions/.test(message)) category = 'TOOL_PERMISSION';
  if (/approvalPolicy|riskTier/.test(message)) category = 'POLICY';

  return {
    category,
    message,
    nodeId: nodeMatch?.[1] ?? edgeEndpointMatch?.[1] ?? null,
    edgeRef: edgeMatch?.[1] ?? null,
  };
}

function validateOptionalInteger(
  value: number | undefined,
  name: string,
  minimum: number,
  maximum: number,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function validateOptionalNumber(
  value: number | undefined,
  name: string,
  minimum: number,
  maximum: number,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    errors.push(`${name} must be between ${minimum} and ${maximum}`);
  }
}

function validateStringList(
  values: readonly string[] | undefined,
  name: string,
  errors: string[],
): void {
  if (values === undefined) return;
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) errors.push(`${name} cannot contain empty values`);
  if (new Set(normalized).size !== normalized.length) {
    errors.push(`${name} must contain unique values`);
  }
}

function requireText(value: string, name: string, errors?: string[]): void {
  if (value.trim()) return;
  if (errors) errors.push(`${name} is required`);
  else throw new Error(`${name} is required`);
}
