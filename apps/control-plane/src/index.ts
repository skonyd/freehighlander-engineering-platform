export interface ControlPlaneFoundationInfo {
  readonly name: 'freehighlander-control-plane';
  readonly phase: 'FH-01A';
  readonly workflowAuthority: 'disabled-until-fh-01b';
  readonly uiCoupling: 'independent';
}

export function getControlPlaneFoundationInfo(): ControlPlaneFoundationInfo {
  return {
    name: 'freehighlander-control-plane',
    phase: 'FH-01A',
    workflowAuthority: 'disabled-until-fh-01b',
    uiCoupling: 'independent',
  };
}
