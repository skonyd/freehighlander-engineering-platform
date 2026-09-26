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

export function workbenchModeSelectionCanInvokeModel(): false {
  return false;
}

export function workbenchModeSelectionCanGrantAuthority(): false {
  return false;
}
