import { createHash } from 'node:crypto';

import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';

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

export interface FhKuikaWorkflowDraftNodeV1 {
  readonly id: string;
  readonly kind: FhKuikaWorkflowNodeKind;
  readonly role?: string;
}

export interface FhKuikaWorkflowDraftEdgeV1 {
  readonly from: string;
  readonly to: string;
}

export interface FhKuikaWorkflowDraftSpecV1 {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly FhKuikaWorkflowDraftNodeV1[];
  readonly edges: readonly FhKuikaWorkflowDraftEdgeV1[];
}

export interface FhKuikaWorkflowDraftV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly status: 'CANDIDATE';
  readonly authority: 'NONE';
  readonly exactRevision: string;
  readonly workflow: FhKuikaWorkflowDraftSpecV1;
  readonly workflowHash: string;
  readonly requiredEvidence: readonly string[];
  readonly unresolvedEvidence: readonly string[];
}

export interface FhKuikaBlueprintSimulationResultV1 {
  readonly schemaVersion: 1;
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly workflowHash: string;
  readonly fixtureId: string;
  readonly expectedTerminalState: 'PASS' | 'FAIL' | 'BLOCKED' | 'HUMAN_REQUIRED';
  readonly observedTerminalState: 'PASS' | 'FAIL' | 'BLOCKED' | 'HUMAN_REQUIRED';
  readonly passed: boolean;
  readonly authority: 'NONE';
  readonly checks: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly detail: string;
  }[];
}

export interface CreateFhKuikaWorkflowDraftInputV1 {
  readonly blueprint: FhKuikaPublishedBlueprintV1;
  readonly exactRevision: string;
  readonly availableEvidence?: readonly string[];
}

export function createFhKuikaWorkflowDraftV1(
  input: CreateFhKuikaWorkflowDraftInputV1,
): FhKuikaWorkflowDraftV1 {
  requireRevision(input.exactRevision);
  const availableEvidence = new Set((input.availableEvidence ?? []).map((item) => item.trim()));
  const lifecycleNodes = input.blueprint.lifecycleStages.map((stage, index) =>
    createLifecycleNode(stage, index, input.blueprint.requiredRoles),
  );
  const gateNodes = input.blueprint.authoritySensitiveNodes.map((nodeId, index) => ({
    id: normalizeNodeId('gate-' + nodeId + '-' + String(index + 1)),
    kind: 'GATE' as const,
  }));
  const nodes = [...lifecycleNodes, ...gateNodes];
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]!.id,
    to: node.id,
  }));

  const workflow: FhKuikaWorkflowDraftSpecV1 = {
    id: 'fh-kuika-' + input.blueprint.id,
    version: input.blueprint.version,
    nodes,
    edges,
  };

  validateWorkflowShape(workflow);

  const unresolvedEvidence = input.blueprint.requiredEvidence.filter(
    (item) => !availableEvidence.has(item),
  );
  const workflowHash = createHash('sha256').update(stableJson(workflow)).digest('hex');

  return deepFreeze({
    schemaVersion: 1,
    blueprintId: input.blueprint.id,
    blueprintVersion: input.blueprint.version,
    blueprintHash: input.blueprint.blueprintHash,
    status: 'CANDIDATE' as const,
    authority: 'NONE' as const,
    exactRevision: input.exactRevision,
    workflow,
    workflowHash,
    requiredEvidence: [...input.blueprint.requiredEvidence],
    unresolvedEvidence,
  });
}

export function simulateFhKuikaBlueprintDraftV1(
  draft: FhKuikaWorkflowDraftV1,
  fixtureId: string,
  blueprint: FhKuikaPublishedBlueprintV1,
): FhKuikaBlueprintSimulationResultV1 {
  if (draft.blueprintId !== blueprint.id || draft.blueprintHash !== blueprint.blueprintHash) {
    throw new Error('workflow draft is not bound to the supplied blueprint');
  }

  const fixture = blueprint.simulationFixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw new Error('unknown blueprint simulation fixture');

  const checks = [
    {
      id: 'workflow-shape',
      passed: workflowShapeIsValid(draft.workflow),
      detail: 'Workflow draft uses bounded canonical node/edge shape.',
    },
    {
      id: 'exact-revision',
      passed: /^[A-Fa-f0-9]{7,64}$/.test(draft.exactRevision),
      detail: 'Workflow candidate remains bound to one exact revision.',
    },
    {
      id: 'authority-gates',
      passed: blueprint.authoritySensitiveNodes.length === 0 || hasGateNode(draft.workflow),
      detail: 'Authority-sensitive blueprint nodes retain explicit gate nodes.',
    },
    {
      id: 'required-evidence',
      passed: draft.unresolvedEvidence.length === 0,
      detail:
        draft.unresolvedEvidence.length === 0
          ? 'All required evidence is available.'
          : 'Missing evidence: ' + draft.unresolvedEvidence.join(', '),
    },
  ];

  const structurallyReady = checks.every((check) => check.passed);
  const observedTerminalState =
    fixture.expectedTerminalState === 'HUMAN_REQUIRED'
      ? 'HUMAN_REQUIRED'
      : structurallyReady
        ? fixture.expectedTerminalState
        : 'BLOCKED';

  return deepFreeze({
    schemaVersion: 1,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    workflowHash: draft.workflowHash,
    fixtureId: fixture.id,
    expectedTerminalState: fixture.expectedTerminalState,
    observedTerminalState,
    passed: observedTerminalState === fixture.expectedTerminalState,
    authority: 'NONE' as const,
    checks,
  });
}

export function fhKuikaBlueprintWorkflowDraftCanInvokeModel(): false {
  return false;
}

export function fhKuikaBlueprintWorkflowDraftCanMutateRuntime(): false {
  return false;
}

export function fhKuikaBlueprintWorkflowDraftCanGrantAuthority(): false {
  return false;
}

function createLifecycleNode(
  stage: string,
  index: number,
  requiredRoles: readonly string[],
): FhKuikaWorkflowDraftNodeV1 {
  const id = normalizeNodeId(String(index + 1) + '-' + stage);
  const role = chooseRole(stage, requiredRoles);
  return {
    id,
    kind: 'MODEL',
    ...(role ? { role } : {}),
  };
}

function chooseRole(stage: string, roles: readonly string[]): string | undefined {
  const normalized = stage.toUpperCase();
  const preferences: readonly [string, readonly string[]][] = [
    ['SECURITY', ['security-reviewer']],
    ['RELEASE', ['release-reviewer']],
    ['ARCHITECTURE', ['architecture-reviewer']],
    ['ADR', ['architecture-reviewer']],
    ['MIGRATION', ['database-migration-reviewer']],
    ['INCIDENT', ['incident-investigator']],
    ['TRIAGE', ['incident-investigator']],
    ['INVESTIGATE', ['incident-investigator', 'performance-reviewer']],
    ['BENCHMARK', ['performance-reviewer']],
    ['DEPENDENCY', ['dependency-upgrade-specialist']],
    ['TEST', ['test-reviewer']],
    ['REVIEW', ['test-reviewer', 'architecture-reviewer', 'security-reviewer', 'release-reviewer']],
    ['IMPLEMENT', ['implementation-agent']],
    ['REMEDIATE', ['implementation-agent']],
  ];

  for (const [token, candidates] of preferences) {
    if (!normalized.includes(token)) continue;
    const candidate = candidates.find((role) => roles.includes(role));
    if (candidate) return candidate;
  }

  return roles[0];
}

function validateWorkflowShape(workflow: FhKuikaWorkflowDraftSpecV1): void {
  if (!workflow.nodes.length) throw new Error('workflow draft must contain at least one node');
  if (!/^\d+\.\d+\.\d+$/.test(workflow.version)) {
    throw new Error('workflow draft version must use semantic versioning');
  }

  const ids = workflow.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) throw new Error('workflow draft node IDs must be unique');

  for (const edge of workflow.edges) {
    if (!ids.includes(edge.from) || !ids.includes(edge.to)) {
      throw new Error('workflow draft edge references unknown node');
    }
    if (edge.from === edge.to) throw new Error('workflow draft self edge is forbidden');
  }
}

function workflowShapeIsValid(workflow: FhKuikaWorkflowDraftSpecV1): boolean {
  try {
    validateWorkflowShape(workflow);
    return true;
  } catch {
    return false;
  }
}

function hasGateNode(workflow: FhKuikaWorkflowDraftSpecV1): boolean {
  return workflow.nodes.some((node) => node.kind === 'GATE');
}

function normalizeNodeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function requireRevision(value: string): void {
  if (!/^[A-Fa-f0-9]{7,64}$/.test(value)) {
    throw new Error('exactRevision must be a 7-64 character hexadecimal revision');
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map((entry) => stableJson(entry)).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => JSON.stringify(key) + ':' + stableJson(entry))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
