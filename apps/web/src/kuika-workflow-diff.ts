import type {
  FhKuikaCanonicalWorkflowDefinitionV1,
  FhKuikaCanonicalWorkflowEdgeV1,
  FhKuikaCanonicalWorkflowNodeV1,
} from './kuika-workflow-draft.js';

export interface FhKuikaWorkflowNodeChangeV1 {
  readonly nodeId: string;
  readonly change: 'ADDED' | 'REMOVED' | 'CHANGED';
  readonly authoritySensitive: boolean;
}

export interface FhKuikaWorkflowVersionDiffV1 {
  readonly previousVersion: string | null;
  readonly nextVersion: string;
  readonly nodeChanges: readonly FhKuikaWorkflowNodeChangeV1[];
  readonly addedEdges: readonly string[];
  readonly removedEdges: readonly string[];
  readonly authoritySensitiveChange: boolean;
  readonly authority: 'NONE';
  readonly publishAuthorized: false;
}

export function buildFhKuikaWorkflowVersionDiffV1(
  previous: FhKuikaCanonicalWorkflowDefinitionV1 | null,
  next: FhKuikaCanonicalWorkflowDefinitionV1,
): FhKuikaWorkflowVersionDiffV1 {
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const nodeIds = [...new Set([...previousNodes.keys(), ...nextNodes.keys()])].sort();

  const nodeChanges = nodeIds.flatMap((nodeId) => {
    const before = previousNodes.get(nodeId);
    const after = nextNodes.get(nodeId);
    if (!before && after) return [nodeChange(nodeId, 'ADDED', after)];
    if (before && !after) return [nodeChange(nodeId, 'REMOVED', before)];
    if (before && after && !sameNode(before, after)) {
      return [
        {
          nodeId,
          change: 'CHANGED' as const,
          authoritySensitive: isAuthoritySensitive(before) || isAuthoritySensitive(after),
        },
      ];
    }
    return [];
  });

  const previousEdges = new Set((previous?.edges ?? []).map(edgeKey));
  const nextEdges = new Set(next.edges.map(edgeKey));
  const addedEdges = [...nextEdges].filter((edge) => !previousEdges.has(edge)).sort();
  const removedEdges = [...previousEdges].filter((edge) => !nextEdges.has(edge)).sort();

  return {
    previousVersion: previous?.version ?? null,
    nextVersion: next.version,
    nodeChanges,
    addedEdges,
    removedEdges,
    authoritySensitiveChange: nodeChanges.some((change) => change.authoritySensitive),
    authority: 'NONE',
    publishAuthorized: false,
  };
}

export function workflowVersionDiffCanPublish(): false {
  return false;
}

export function workflowVersionDiffCanGrantAuthority(): false {
  return false;
}

function nodeChange(
  nodeId: string,
  change: 'ADDED' | 'REMOVED',
  node: FhKuikaCanonicalWorkflowNodeV1,
): FhKuikaWorkflowNodeChangeV1 {
  return {
    nodeId,
    change,
    authoritySensitive: isAuthoritySensitive(node),
  };
}

function isAuthoritySensitive(node: FhKuikaCanonicalWorkflowNodeV1): boolean {
  return node.kind === 'GATE' || node.kind === 'HUMAN';
}

function sameNode(
  left: FhKuikaCanonicalWorkflowNodeV1,
  right: FhKuikaCanonicalWorkflowNodeV1,
): boolean {
  return (
    left.kind === right.kind &&
    left.role === right.role &&
    left.maxIterations === right.maxIterations
  );
}

function edgeKey(edge: FhKuikaCanonicalWorkflowEdgeV1): string {
  return edge.from + '->' + edge.to;
}
