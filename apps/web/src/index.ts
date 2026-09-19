export interface WebFoundationInfo {
  readonly name: 'freehighlander-web';
  readonly mode: 'read-only-foundation';
  readonly executionOwnership: 'control-plane';
}

export function getWebFoundationInfo(): WebFoundationInfo {
  return {
    name: 'freehighlander-web',
    mode: 'read-only-foundation',
    executionOwnership: 'control-plane',
  };
}
