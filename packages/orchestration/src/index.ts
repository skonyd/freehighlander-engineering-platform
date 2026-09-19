export type RunStatus =
  'PENDING' | 'RUNNING' | 'WAITING' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'HUMAN_REQUIRED';

export interface WorkflowNode {
  readonly id: string;
  readonly kind:
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
  readonly maxIterations?: number;
}

export interface WorkflowSnapshot {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
  readonly nodes: readonly WorkflowNode[];
}

export function validateBoundedExecution(snapshot: WorkflowSnapshot): readonly string[] {
  const errors: string[] = [];

  for (const node of snapshot.nodes) {
    const missingBound = node.kind === 'LOOP' && node.maxIterations === undefined;
    const invalidBound = node.kind === 'LOOP' && (node.maxIterations ?? 0) < 1;

    if (missingBound || invalidBound) {
      errors.push(`LOOP node ${node.id} must define maxIterations >= 1`);
    }
  }

  return errors;
}
