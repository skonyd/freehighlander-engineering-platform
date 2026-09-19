export interface ArtifactMetadata {
  readonly artifactId: string;
  readonly exactRevision: string;
  readonly producerRole: string;
  readonly bindingId: string;
  readonly provider: string;
  readonly model: string;
  readonly effort?: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly contractHash: string;
}

export interface ArtifactValidityContext {
  readonly exactRevision: string;
  readonly contractHash: string;
}

export function artifactIdentityKey(metadata: ArtifactMetadata): string {
  return [
    metadata.exactRevision,
    metadata.contractHash,
    metadata.producerRole,
    metadata.bindingId,
    metadata.inputHash,
  ].join('|');
}

export function isArtifactCurrent(
  metadata: ArtifactMetadata,
  context: ArtifactValidityContext,
): boolean {
  return (
    metadata.exactRevision === context.exactRevision &&
    metadata.contractHash === context.contractHash
  );
}
