import type { FhKuikaCanonicalWorkflowNodeV1 } from './kuika-workflow-draft.js';

export type FhKuikaWorkflowInspectorResolution =
  | 'RESOLVED'
  | 'NOT_APPLICABLE'
  | 'UNRESOLVED_IN_CANONICAL_V1';

export interface FhKuikaWorkflowInspectorFieldV1 {
  readonly label: string;
  readonly value: string | number | null;
  readonly resolution: FhKuikaWorkflowInspectorResolution;
  readonly source: 'CANONICAL_WORKFLOW_V1' | 'PUBLISH_VALIDATION';
}

export interface FhKuikaWorkflowNodeInspectorV1 {
  readonly schemaVersion: 1;
  readonly nodeId: string;
  readonly nodeKind: FhKuikaCanonicalWorkflowNodeV1['kind'];
  readonly authority: 'NONE';
  readonly runtimeMutationAuthorized: false;
  readonly fields: {
    readonly role: FhKuikaWorkflowInspectorFieldV1;
    readonly loopBound: FhKuikaWorkflowInspectorFieldV1;
    readonly budget: FhKuikaWorkflowInspectorFieldV1;
    readonly evidence: FhKuikaWorkflowInspectorFieldV1;
    readonly policy: FhKuikaWorkflowInspectorFieldV1;
    readonly toolPermissions: FhKuikaWorkflowInspectorFieldV1;
  };
}

export function buildFhKuikaWorkflowNodeInspectorV1(
  node: FhKuikaCanonicalWorkflowNodeV1,
): FhKuikaWorkflowNodeInspectorV1 {
  const role =
    node.role === undefined
      ? unresolvedOrNotApplicable('Role', node.kind === 'MODEL')
      : resolved('Role', node.role);

  const loopBound =
    node.kind !== 'LOOP'
      ? notApplicable('Loop bound')
      : node.maxIterations === undefined
        ? unresolved('Loop bound')
        : resolved('Loop bound', node.maxIterations);

  return {
    schemaVersion: 1,
    nodeId: node.id,
    nodeKind: node.kind,
    authority: 'NONE',
    runtimeMutationAuthorized: false,
    fields: {
      role,
      loopBound,
      budget: unresolved('Budget'),
      evidence: unresolved('Evidence'),
      policy: unresolved('Policy'),
      toolPermissions: unresolved('Tool permissions'),
    },
  };
}

export function workflowInspectorCanGrantAuthority(): false {
  return false;
}

export function workflowInspectorCanMutateRuntime(): false {
  return false;
}

export function workflowInspectorCanInventUnsupportedFields(): false {
  return false;
}

function resolved(
  label: string,
  value: string | number,
): FhKuikaWorkflowInspectorFieldV1 {
  return {
    label,
    value,
    resolution: 'RESOLVED',
    source: 'CANONICAL_WORKFLOW_V1',
  };
}

function unresolved(label: string): FhKuikaWorkflowInspectorFieldV1 {
  return {
    label,
    value: null,
    resolution: 'UNRESOLVED_IN_CANONICAL_V1',
    source: 'PUBLISH_VALIDATION',
  };
}

function notApplicable(label: string): FhKuikaWorkflowInspectorFieldV1 {
  return {
    label,
    value: null,
    resolution: 'NOT_APPLICABLE',
    source: 'CANONICAL_WORKFLOW_V1',
  };
}

function unresolvedOrNotApplicable(
  label: string,
  applicable: boolean,
): FhKuikaWorkflowInspectorFieldV1 {
  return applicable ? unresolved(label) : notApplicable(label);
}
