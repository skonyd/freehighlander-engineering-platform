import type { CoreHomeSnapshotV1 } from './home.js';

export type FhKuikaWorkbenchMode = 'ASK' | 'PLAN' | 'EXECUTE' | 'REVIEW';

export interface FhKuikaWorkbenchModeView {
  readonly mode: FhKuikaWorkbenchMode;
  readonly purpose: string;
  readonly selectionAuthority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
  readonly canSelect: true;
  readonly canInvokeModelOnSelection: false;
  readonly canGrantAuthority: false;
  readonly mutationCapable: boolean;
  readonly requiresEnabledV3Authority: boolean;
}

export type FhKuikaWorkbenchContextKind =
  'REPOSITORY' | 'BRANCH' | 'EXACT_REVISION' | 'WORKFLOW' | 'RUN' | 'EVIDENCE';

export interface FhKuikaWorkbenchContextChipV1 {
  readonly kind: FhKuikaWorkbenchContextKind;
  readonly label: string;
  readonly value: string;
  readonly source: 'CORE_HOME';
  readonly removable: boolean;
  readonly authoritative: boolean;
}

export interface FhKuikaWorkbenchPreflightV1 {
  readonly mode: FhKuikaWorkbenchMode;
  readonly selectionAuthority: 'NONE';
  readonly executionOwner: 'CONTROL_PLANE';
  readonly v3Authority: CoreHomeSnapshotV1['authority']['v3Authority'];
  readonly mutationCapable: boolean;
  readonly canStartRequest: boolean;
  readonly blockedReason: string | null;
  readonly exactRevisionBound: boolean;
  readonly sourceState: 'CURRENT' | 'PARTIAL';
  readonly staleSources: readonly string[];
}

export interface FhKuikaWorkbenchSnapshotV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly projectionAuthority: 'NONE';
  readonly mode: FhKuikaWorkbenchModeView;
  readonly context: readonly FhKuikaWorkbenchContextChipV1[];
  readonly preflight: FhKuikaWorkbenchPreflightV1;
}

const MODE_VIEWS: Record<FhKuikaWorkbenchMode, FhKuikaWorkbenchModeView> = {
  ASK: {
    mode: 'ASK',
    purpose: 'Read-only project and engineering questions.',
    selectionAuthority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
    canSelect: true,
    canInvokeModelOnSelection: false,
    canGrantAuthority: false,
    mutationCapable: false,
    requiresEnabledV3Authority: false,
  },
  PLAN: {
    mode: 'PLAN',
    purpose: 'Produce candidate plans and structured engineering work proposals.',
    selectionAuthority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
    canSelect: true,
    canInvokeModelOnSelection: false,
    canGrantAuthority: false,
    mutationCapable: false,
    requiresEnabledV3Authority: false,
  },
  EXECUTE: {
    mode: 'EXECUTE',
    purpose: 'Request a bounded writer workflow through normal control-plane policy.',
    selectionAuthority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
    canSelect: true,
    canInvokeModelOnSelection: false,
    canGrantAuthority: false,
    mutationCapable: true,
    requiresEnabledV3Authority: true,
  },
  REVIEW: {
    mode: 'REVIEW',
    purpose: 'Request independent review bound to an exact revision and evidence set.',
    selectionAuthority: 'NONE',
    executionOwner: 'CONTROL_PLANE',
    canSelect: true,
    canInvokeModelOnSelection: false,
    canGrantAuthority: false,
    mutationCapable: false,
    requiresEnabledV3Authority: false,
  },
};

export function getFhKuikaWorkbenchModeView(mode: FhKuikaWorkbenchMode): FhKuikaWorkbenchModeView {
  return { ...MODE_VIEWS[mode] };
}

export function listFhKuikaWorkbenchModes(): readonly FhKuikaWorkbenchModeView[] {
  return (['ASK', 'PLAN', 'EXECUTE', 'REVIEW'] as const).map((mode) =>
    getFhKuikaWorkbenchModeView(mode),
  );
}

export function buildFhKuikaWorkbenchSnapshotV1(
  home: CoreHomeSnapshotV1,
  mode: FhKuikaWorkbenchMode = 'ASK',
): FhKuikaWorkbenchSnapshotV1 {
  const modeView = getFhKuikaWorkbenchModeView(mode);
  const context = buildContext(home);
  const exactRevisionBound = context.some((item) => item.kind === 'EXACT_REVISION');
  const staleSources = [...home.sourceFreshness.staleSources];
  const sourceState = staleSources.length === 0 ? 'CURRENT' : 'PARTIAL';

  let blockedReason: string | null = null;
  if (!home.project.repository) {
    blockedReason = 'Repository context is unavailable.';
  } else if ((mode === 'REVIEW' || mode === 'EXECUTE') && !exactRevisionBound) {
    blockedReason = 'An exact revision is required for this mode.';
  } else if (modeView.requiresEnabledV3Authority && home.authority.v3Authority !== 'ENABLED') {
    blockedReason = `V3 authority is ${home.authority.v3Authority}; EXECUTE remains unavailable.`;
  }

  return {
    schemaVersion: 1,
    generatedAt: home.generatedAt,
    projectionAuthority: 'NONE',
    mode: modeView,
    context,
    preflight: {
      mode,
      selectionAuthority: 'NONE',
      executionOwner: 'CONTROL_PLANE',
      v3Authority: home.authority.v3Authority,
      mutationCapable: modeView.mutationCapable,
      canStartRequest: blockedReason === null,
      blockedReason,
      exactRevisionBound,
      sourceState,
      staleSources,
    },
  };
}

export function workbenchModeSelectionCanInvokeModel(): false {
  return false;
}

export function workbenchModeSelectionCanGrantAuthority(): false {
  return false;
}

export function workbenchSnapshotCanMutateRuntime(): false {
  return false;
}

function buildContext(home: CoreHomeSnapshotV1): readonly FhKuikaWorkbenchContextChipV1[] {
  const result: FhKuikaWorkbenchContextChipV1[] = [];
  const project = home.project;

  if (project.repository) {
    result.push({
      kind: 'REPOSITORY',
      label: 'Repository',
      value: project.repository,
      source: 'CORE_HOME',
      removable: false,
      authoritative: false,
    });
  }

  if (project.branch) {
    result.push({
      kind: 'BRANCH',
      label: 'Branch',
      value: project.branch,
      source: 'CORE_HOME',
      removable: true,
      authoritative: false,
    });
  }

  if (project.headSha) {
    result.push({
      kind: 'EXACT_REVISION',
      label: 'Exact revision',
      value: project.headSha,
      source: 'CORE_HOME',
      removable: false,
      authoritative: true,
    });
  }

  if (home.currentWork?.workflowId) {
    result.push({
      kind: 'WORKFLOW',
      label: 'Workflow',
      value: [
        home.currentWork.workflowId,
        home.currentWork.workflowVersion ? `v${home.currentWork.workflowVersion}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      source: 'CORE_HOME',
      removable: true,
      authoritative: false,
    });
  }

  if (home.currentWork?.runId) {
    result.push({
      kind: 'RUN',
      label: 'Run',
      value: home.currentWork.runId,
      source: 'CORE_HOME',
      removable: true,
      authoritative: false,
    });
  }

  return result;
}
