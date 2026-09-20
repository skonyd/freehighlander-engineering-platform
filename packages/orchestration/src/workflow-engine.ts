import { createHash } from 'node:crypto';

export type WorkflowNodeKind =
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

export interface WorkflowDefinitionNode {
  readonly id: string;
  readonly kind: WorkflowNodeKind;
  readonly role?: string;
  readonly maxIterations?: number;
}

export interface WorkflowEdge {
  readonly from: string;
  readonly to: string;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly WorkflowDefinitionNode[];
  readonly edges: readonly WorkflowEdge[];
}

export interface PublishedWorkflow {
  readonly definition: WorkflowDefinition;
  readonly workflowHash: string;
}

export type WorkflowNodeState =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'BLOCKED'
  | 'HUMAN_REQUIRED';

export interface RunSnapshotInput {
  readonly workflow: PublishedWorkflow;
  readonly roleVersions: Readonly<Record<string, string>>;
  readonly policyHash: string;
  readonly resolvedBindings: Readonly<Record<string, string>>;
  readonly providerCapabilitySnapshot: Readonly<Record<string, readonly string[]>>;
}

export interface RunSnapshot {
  readonly workflowHash: string;
  readonly roleVersions: Readonly<Record<string, string>>;
  readonly policyHash: string;
  readonly resolvedBindings: Readonly<Record<string, string>>;
  readonly providerCapabilitySnapshot: Readonly<Record<string, readonly string[]>>;
  readonly snapshotHash: string;
}

const terminalFailureStates = new Set<WorkflowNodeState>(['FAILED', 'BLOCKED']);

const legalTransitions: Readonly<Record<WorkflowNodeState, readonly WorkflowNodeState[]>> = {
  PENDING: ['READY', 'BLOCKED'],
  READY: ['RUNNING', 'HUMAN_REQUIRED', 'BLOCKED'],
  RUNNING: ['PASSED', 'FAILED', 'BLOCKED', 'HUMAN_REQUIRED'],
  PASSED: [],
  FAILED: [],
  BLOCKED: [],
  HUMAN_REQUIRED: ['RUNNING', 'PASSED', 'FAILED', 'BLOCKED'],
};

export function publishWorkflow(definition: WorkflowDefinition): PublishedWorkflow {
  validateWorkflow(definition);
  const normalized = normalizeWorkflow(definition);
  return {
    definition: normalized,
    workflowHash: sha256(canonicalJson(normalized)),
  };
}

export function validateWorkflow(definition: WorkflowDefinition): void {
  requireText(definition.id, 'workflow id');
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new Error('workflow version must be semantic version x.y.z');
  }
  if (definition.nodes.length === 0) throw new Error('workflow must contain at least one node');

  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    requireText(node.id, 'workflow node id');
    if (nodeIds.has(node.id)) throw new Error(`duplicate workflow node id: ${node.id}`);
    nodeIds.add(node.id);
    if (node.kind === 'LOOP' && (!Number.isInteger(node.maxIterations) || (node.maxIterations ?? 0) < 1)) {
      throw new Error(`LOOP node ${node.id} must define maxIterations >= 1`);
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`unknown workflow edge source: ${edge.from}`);
    if (!nodeIds.has(edge.to)) throw new Error(`unknown workflow edge target: ${edge.to}`);
    if (edge.from === edge.to) throw new Error(`workflow self-cycle is forbidden: ${edge.from}`);
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) throw new Error(`duplicate workflow edge: ${key}`);
    edgeKeys.add(key);
  }

  assertAcyclic(definition.nodes, definition.edges);
}

export function createInitialNodeStates(
  workflow: PublishedWorkflow,
): Readonly<Record<string, WorkflowNodeState>> {
  const predecessors = predecessorMap(workflow.definition);
  const states: Record<string, WorkflowNodeState> = {};
  for (const node of workflow.definition.nodes) {
    states[node.id] = (predecessors.get(node.id)?.length ?? 0) === 0 ? 'READY' : 'PENDING';
  }
  return states;
}

export function transitionNodeState(
  states: Readonly<Record<string, WorkflowNodeState>>,
  nodeId: string,
  next: WorkflowNodeState,
): Readonly<Record<string, WorkflowNodeState>> {
  const current = states[nodeId];
  if (current === undefined) throw new Error(`unknown workflow node state: ${nodeId}`);
  if (!legalTransitions[current].includes(next)) {
    throw new Error(`illegal workflow transition: ${nodeId} ${current} -> ${next}`);
  }
  return { ...states, [nodeId]: next };
}

export function propagateWorkflowStates(
  workflow: PublishedWorkflow,
  inputStates: Readonly<Record<string, WorkflowNodeState>>,
): Readonly<Record<string, WorkflowNodeState>> {
  const states: Record<string, WorkflowNodeState> = { ...inputStates };
  const predecessors = predecessorMap(workflow.definition);

  for (const node of topologicalNodes(workflow.definition)) {
    if (states[node.id] !== 'PENDING') continue;
    const parentIds = predecessors.get(node.id) ?? [];
    const parentStates = parentIds.map((id) => states[id]);

    if (parentStates.some((state) => state !== undefined && terminalFailureStates.has(state))) {
      states[node.id] = 'BLOCKED';
    } else if (parentStates.length > 0 && parentStates.every((state) => state === 'PASSED')) {
      states[node.id] = 'READY';
    }
  }

  return states;
}

export function buildRunSnapshot(input: RunSnapshotInput): RunSnapshot {
  requireHash(input.workflow.workflowHash, 'workflowHash');
  requireHash(input.policyHash, 'policyHash');

  const roleVersions = sortedRecord(input.roleVersions);
  const resolvedBindings = sortedRecord(input.resolvedBindings);
  const providerCapabilitySnapshot = Object.fromEntries(
    Object.entries(input.providerCapabilitySnapshot)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([provider, capabilities]) => [provider, [...new Set(capabilities)].sort()]),
  );

  const identity = {
    workflowHash: input.workflow.workflowHash,
    roleVersions,
    policyHash: input.policyHash,
    resolvedBindings,
    providerCapabilitySnapshot,
  };

  return {
    ...identity,
    snapshotHash: sha256(canonicalJson(identity)),
  };
}

export function workflowConfigurationCanGrantAuthority(): false {
  return false;
}

function assertAcyclic(nodes: readonly WorkflowDefinitionNode[], edges: readonly WorkflowEdge[]): void {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
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

function topologicalNodes(definition: WorkflowDefinition): readonly WorkflowDefinitionNode[] {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const indegree = new Map(definition.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of definition.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const queue = definition.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
  const ordered: WorkflowDefinitionNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }
  return ordered;
}

function predecessorMap(definition: WorkflowDefinition): Map<string, string[]> {
  const result = new Map(definition.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of definition.edges) result.get(edge.to)?.push(edge.from);
  for (const values of result.values()) values.sort();
  return result;
}

function normalizeWorkflow(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    id: definition.id,
    version: definition.version,
    nodes: definition.nodes
      .map((node) => ({ ...node }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: definition.edges
      .map((edge) => ({ ...edge }))
      .sort((left, right) => `${left.from}->${left.to}`.localeCompare(`${right.from}->${right.to}`)),
  };
}

function sortedRecord(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function requireHash(value: string, name: string): void {
  requireText(value, name);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
