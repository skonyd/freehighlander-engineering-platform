import { createHash } from 'node:crypto';

export type FhKuikaStudioWorkflowNodeKind =
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

export interface FhKuikaStudioWorkflowNodeV1 {
  readonly id: string;
  readonly kind: FhKuikaStudioWorkflowNodeKind;
  readonly role?: string;
  readonly maxIterations?: number;
}

export interface FhKuikaStudioWorkflowEdgeV1 {
  readonly from: string;
  readonly to: string;
}

export interface FhKuikaStudioWorkflowDefinitionV1 {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly FhKuikaStudioWorkflowNodeV1[];
  readonly edges: readonly FhKuikaStudioWorkflowEdgeV1[];
}

export interface FhKuikaStudioWorkflowDraftV1 {
  readonly schemaVersion: 1;
  readonly status: 'DRAFT';
  readonly authority: 'NONE';
  readonly definition: FhKuikaStudioWorkflowDefinitionV1;
  readonly draftHash: string;
}

const NODE_KINDS = new Set<FhKuikaStudioWorkflowNodeKind>([
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

export function createFhKuikaStudioWorkflowDraftV1(
  definition: FhKuikaStudioWorkflowDefinitionV1,
): FhKuikaStudioWorkflowDraftV1 {
  validateFhKuikaStudioWorkflowDefinitionV1(definition);
  const normalized = normalizeDefinition(definition);
  return deepFreeze({
    schemaVersion: 1,
    status: 'DRAFT' as const,
    authority: 'NONE' as const,
    definition: normalized,
    draftHash: sha256(stableJson(normalized)),
  });
}

export function parseFhKuikaStudioWorkflowDraftV1(input: unknown): FhKuikaStudioWorkflowDraftV1 {
  if (!isRecord(input)) throw new Error('workflow Studio draft must be an object');
  if (input.schemaVersion !== 1) throw new Error('workflow Studio draft schemaVersion must be 1');
  if (input.status !== 'DRAFT') throw new Error('workflow Studio draft status must be DRAFT');
  if (input.authority !== 'NONE') throw new Error('workflow Studio draft authority must be NONE');
  if (!isRecord(input.definition)) throw new Error('workflow Studio draft definition is required');

  const definition = parseDefinition(input.definition);
  const rebuilt = createFhKuikaStudioWorkflowDraftV1(definition);

  if (typeof input.draftHash !== 'string' || input.draftHash !== rebuilt.draftHash) {
    throw new Error('workflow Studio draft hash mismatch');
  }
  return rebuilt;
}

export function serializeFhKuikaStudioWorkflowDraftV1(draft: FhKuikaStudioWorkflowDraftV1): string {
  const parsed = parseFhKuikaStudioWorkflowDraftV1(draft);
  return stableJson(parsed);
}

export function roundTripFhKuikaStudioWorkflowDraftV1(
  draft: FhKuikaStudioWorkflowDraftV1,
): FhKuikaStudioWorkflowDraftV1 {
  return parseFhKuikaStudioWorkflowDraftV1(
    JSON.parse(serializeFhKuikaStudioWorkflowDraftV1(draft)),
  );
}

export function validateFhKuikaStudioWorkflowDefinitionV1(
  definition: FhKuikaStudioWorkflowDefinitionV1,
): void {
  requireText(definition.id, 'workflow id');
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new Error('workflow version must use semantic versioning');
  }
  if (definition.nodes.length === 0) {
    throw new Error('workflow draft must contain at least one node');
  }

  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    requireText(node.id, 'workflow node id');
    if (!NODE_KINDS.has(node.kind)) throw new Error('unknown workflow node kind');
    if (nodeIds.has(node.id)) throw new Error('duplicate workflow node id: ' + node.id);
    nodeIds.add(node.id);

    if (node.role !== undefined) requireText(node.role, 'workflow node role');
    if (node.kind === 'LOOP') {
      if (!Number.isInteger(node.maxIterations) || (node.maxIterations ?? 0) < 1) {
        throw new Error('LOOP node must define maxIterations >= 1');
      }
    } else if (node.maxIterations !== undefined) {
      throw new Error('maxIterations is only valid for LOOP nodes');
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.from)) throw new Error('unknown workflow edge source: ' + edge.from);
    if (!nodeIds.has(edge.to)) throw new Error('unknown workflow edge target: ' + edge.to);
    if (edge.from === edge.to) throw new Error('workflow self-cycle is forbidden');
    const key = edge.from + '->' + edge.to;
    if (edgeKeys.has(key)) throw new Error('duplicate workflow edge: ' + key);
    edgeKeys.add(key);
  }

  assertAcyclic(definition.nodes, definition.edges);
}

export function fhKuikaWorkflowStudioDraftCanInvokeModel(): false {
  return false;
}

export function fhKuikaWorkflowStudioDraftCanMutateRuntime(): false {
  return false;
}

export function fhKuikaWorkflowStudioDraftCanGrantAuthority(): false {
  return false;
}

export function fhKuikaWorkflowStudioDraftCanPublish(): false {
  return false;
}

function parseDefinition(input: Record<string, unknown>): FhKuikaStudioWorkflowDefinitionV1 {
  if (typeof input.id !== 'string' || typeof input.version !== 'string') {
    throw new Error('workflow Studio definition id/version are required');
  }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error('workflow Studio definition nodes/edges are required');
  }

  return {
    id: input.id,
    version: input.version,
    nodes: input.nodes.map(parseNode),
    edges: input.edges.map(parseEdge),
  };
}

function parseNode(input: unknown): FhKuikaStudioWorkflowNodeV1 {
  if (!isRecord(input) || typeof input.id !== 'string' || typeof input.kind !== 'string') {
    throw new Error('workflow Studio node is malformed');
  }
  if (!NODE_KINDS.has(input.kind as FhKuikaStudioWorkflowNodeKind)) {
    throw new Error('unknown workflow node kind');
  }
  if (input.role !== undefined && typeof input.role !== 'string') {
    throw new Error('workflow Studio node role must be a string');
  }
  if (input.maxIterations !== undefined && typeof input.maxIterations !== 'number') {
    throw new Error('workflow Studio node maxIterations must be a number');
  }

  return {
    id: input.id,
    kind: input.kind as FhKuikaStudioWorkflowNodeKind,
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.maxIterations === undefined ? {} : { maxIterations: input.maxIterations }),
  };
}

function parseEdge(input: unknown): FhKuikaStudioWorkflowEdgeV1 {
  if (!isRecord(input) || typeof input.from !== 'string' || typeof input.to !== 'string') {
    throw new Error('workflow Studio edge is malformed');
  }
  return { from: input.from, to: input.to };
}

function normalizeDefinition(
  definition: FhKuikaStudioWorkflowDefinitionV1,
): FhKuikaStudioWorkflowDefinitionV1 {
  return {
    id: definition.id.trim(),
    version: definition.version,
    nodes: definition.nodes
      .map((node) => ({
        id: node.id.trim(),
        kind: node.kind,
        ...(node.role === undefined ? {} : { role: node.role.trim() }),
        ...(node.maxIterations === undefined ? {} : { maxIterations: node.maxIterations }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: definition.edges
      .map((edge) => ({ from: edge.from.trim(), to: edge.to.trim() }))
      .sort((left, right) =>
        (left.from + '->' + left.to).localeCompare(right.from + '->' + right.to),
      ),
  };
}

function assertAcyclic(
  nodes: readonly FhKuikaStudioWorkflowNodeV1[],
  edges: readonly FhKuikaStudioWorkflowEdgeV1[],
): void {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }

  if (visited !== nodes.length) throw new Error('workflow graph must be acyclic');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stableJson(record[key]))
      .join(',') +
    '}'
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireText(value: string, field: string): void {
  if (!value.trim()) throw new Error(field + ' is required');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
