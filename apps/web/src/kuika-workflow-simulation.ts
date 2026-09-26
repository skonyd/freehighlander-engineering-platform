import {
  validateFhKuikaWorkflowDraftDefinitionV1,
  type FhKuikaCanonicalWorkflowDefinitionV1,
  type FhKuikaWorkflowDraftValidationV1,
} from './kuika-workflow-draft.js';

export interface FhKuikaWorkflowSimulationStepV1 {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: string;
  readonly role: string | null;
  readonly runtimeEffect: 'NONE';
}

export interface FhKuikaWorkflowSimulationV1 {
  readonly valid: boolean;
  readonly validation: FhKuikaWorkflowDraftValidationV1;
  readonly orderedSteps: readonly FhKuikaWorkflowSimulationStepV1[];
  readonly terminalState: 'READY_FOR_CANONICAL_REVIEW' | 'BLOCKED';
  readonly authority: 'NONE';
  readonly executionAuthorized: false;
}

export function simulateFhKuikaWorkflowDraftV1(
  definition: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowSimulationV1 {
  const validation = validateFhKuikaWorkflowDraftDefinitionV1(definition);
  if (!validation.valid) {
    return {
      valid: false,
      validation,
      orderedSteps: [],
      terminalState: 'BLOCKED',
      authority: 'NONE',
      executionAuthorized: false,
    };
  }

  const ordered = topologicalOrder(definition);

  return {
    valid: true,
    validation,
    orderedSteps: ordered.map((nodeId, index) => {
      const node = definition.nodes.find((item) => item.id === nodeId)!;
      return {
        index: index + 1,
        nodeId: node.id,
        kind: node.kind,
        role: node.role ?? null,
        runtimeEffect: 'NONE',
      };
    }),
    terminalState: 'READY_FOR_CANONICAL_REVIEW',
    authority: 'NONE',
    executionAuthorized: false,
  };
}

export function workflowStudioSimulationCanExecute(): false {
  return false;
}

export function workflowStudioSimulationCanGrantAuthority(): false {
  return false;
}

function topologicalOrder(definition: FhKuikaCanonicalWorkflowDefinitionV1): readonly string[] {
  const indegree = new Map(definition.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of definition.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  for (const values of outgoing.values()) values.sort((a, b) => a.localeCompare(b));

  const queue = definition.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));

  const ordered: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    ordered.push(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  return ordered;
}
