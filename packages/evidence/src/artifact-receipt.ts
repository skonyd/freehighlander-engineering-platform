export type ArtifactReceiptKind =
  'TEST_LOG' | 'CI_LOG' | 'SCANNER_REPORT' | 'SEARCH_RESULT' | 'DEPENDENCY_REPORT' | 'TOOL_OUTPUT';

export type ArtifactReceiptStatus = 'PASS' | 'FAIL' | 'PARTIAL';

export interface ArtifactReceiptInput {
  readonly artifactId: string;
  readonly exactRevision: string;
  readonly artifactHash: string;
  readonly kind: ArtifactReceiptKind;
  readonly status: ArtifactReceiptStatus;
  readonly itemCount: number;
  readonly failureCount: number;
  readonly sourceBytes: number;
  readonly estimatedSourceTokens: number;
  readonly durationMs?: number;
  readonly relevantExcerptHashes?: readonly string[];
  readonly requiredRawEvidence?: boolean;
}

export interface ArtifactReceipt {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly exactRevision: string;
  readonly artifactHash: string;
  readonly kind: ArtifactReceiptKind;
  readonly status: ArtifactReceiptStatus;
  readonly certificate: 'PASS_CERTIFICATE' | 'FAILURE_RECEIPT' | 'PARTIAL_RECEIPT';
  readonly itemCount: number;
  readonly failureCount: number;
  readonly sourceBytes: number;
  readonly estimatedSourceTokens: number;
  readonly durationMs?: number;
  readonly relevantExcerptHashes: readonly string[];
  readonly requiredRawEvidence: boolean;
  readonly contextReplacement: 'ALLOWED' | 'FORBIDDEN_REQUIRED_RAW_EVIDENCE';
  readonly receiptHash: string;
  readonly authority: 'NONE';
}

const allowedInputKeys = new Set([
  'artifactId',
  'exactRevision',
  'artifactHash',
  'kind',
  'status',
  'itemCount',
  'failureCount',
  'sourceBytes',
  'estimatedSourceTokens',
  'durationMs',
  'relevantExcerptHashes',
  'requiredRawEvidence',
]);

export async function buildArtifactReceipt(input: ArtifactReceiptInput): Promise<ArtifactReceipt> {
  rejectUnknownInputFields(input);

  const artifactId = requireText(input.artifactId, 'artifactId');
  const exactRevision = requireText(input.exactRevision, 'exactRevision');
  const artifactHash = requireSha256(input.artifactHash, 'artifactHash');
  const kind = requireKind(input.kind);
  const status = requireStatus(input.status);
  const itemCount = requireNonNegativeInteger(input.itemCount, 'itemCount');
  const failureCount = requireNonNegativeInteger(input.failureCount, 'failureCount');
  const sourceBytes = requireNonNegativeInteger(input.sourceBytes, 'sourceBytes');
  const estimatedSourceTokens = requireNonNegativeInteger(
    input.estimatedSourceTokens,
    'estimatedSourceTokens',
  );
  const durationMs =
    input.durationMs === undefined
      ? undefined
      : requireNonNegativeInteger(input.durationMs, 'durationMs');
  const relevantExcerptHashes = uniqueSortedHashes(input.relevantExcerptHashes ?? []);
  const requiredRawEvidence = input.requiredRawEvidence ?? false;

  if (failureCount > itemCount) {
    throw new Error('artifact receipt failureCount cannot exceed itemCount');
  }
  if (status === 'PASS' && failureCount !== 0) {
    throw new Error('PASS artifact receipt requires failureCount = 0');
  }
  if (status === 'FAIL' && failureCount === 0) {
    throw new Error('FAIL artifact receipt requires failureCount > 0');
  }
  if (status === 'FAIL' && relevantExcerptHashes.length === 0) {
    throw new Error('FAIL artifact receipt requires at least one relevant excerpt hash');
  }

  const certificate =
    status === 'PASS'
      ? 'PASS_CERTIFICATE'
      : status === 'FAIL'
        ? 'FAILURE_RECEIPT'
        : 'PARTIAL_RECEIPT';
  const contextReplacement = requiredRawEvidence ? 'FORBIDDEN_REQUIRED_RAW_EVIDENCE' : 'ALLOWED';

  const identity = {
    schemaVersion: 1,
    artifactId,
    exactRevision,
    artifactHash,
    kind,
    status,
    certificate,
    itemCount,
    failureCount,
    sourceBytes,
    estimatedSourceTokens,
    durationMs: durationMs ?? null,
    relevantExcerptHashes,
    requiredRawEvidence,
    contextReplacement,
  } as const;

  return {
    schemaVersion: 1,
    artifactId,
    exactRevision,
    artifactHash,
    kind,
    status,
    certificate,
    itemCount,
    failureCount,
    sourceBytes,
    estimatedSourceTokens,
    ...(durationMs === undefined ? {} : { durationMs }),
    relevantExcerptHashes,
    requiredRawEvidence,
    contextReplacement,
    receiptHash: await sha256Hex(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export async function buildPassArtifactCertificate(
  input: Omit<ArtifactReceiptInput, 'status' | 'failureCount'> & {
    readonly failureCount?: 0;
  },
): Promise<ArtifactReceipt> {
  return buildArtifactReceipt({
    ...input,
    status: 'PASS',
    failureCount: 0,
  });
}

export async function validateArtifactReceipt(receipt: ArtifactReceipt): Promise<void> {
  if (receipt.schemaVersion !== 1) {
    throw new Error('artifact receipt schemaVersion must be 1');
  }
  if (receipt.authority !== 'NONE') {
    throw new Error('artifact receipt authority must be NONE');
  }

  const rebuilt = await buildArtifactReceipt({
    artifactId: receipt.artifactId,
    exactRevision: receipt.exactRevision,
    artifactHash: receipt.artifactHash,
    kind: receipt.kind,
    status: receipt.status,
    itemCount: receipt.itemCount,
    failureCount: receipt.failureCount,
    sourceBytes: receipt.sourceBytes,
    estimatedSourceTokens: receipt.estimatedSourceTokens,
    ...(receipt.durationMs === undefined ? {} : { durationMs: receipt.durationMs }),
    relevantExcerptHashes: receipt.relevantExcerptHashes,
    requiredRawEvidence: receipt.requiredRawEvidence,
  });

  if (
    rebuilt.certificate !== receipt.certificate ||
    rebuilt.contextReplacement !== receipt.contextReplacement
  ) {
    throw new Error('artifact receipt derived state mismatch');
  }
  if (rebuilt.receiptHash !== receipt.receiptHash) {
    throw new Error('artifact receipt hash mismatch');
  }
}

export function artifactReceiptCanGrantAuthority(): false {
  return false;
}

export function artifactReceiptCanReplaceRequiredRawEvidence(): false {
  return false;
}

function rejectUnknownInputFields(input: ArtifactReceiptInput): void {
  for (const key of Object.keys(input as unknown as Record<string, unknown>)) {
    if (!allowedInputKeys.has(key)) {
      throw new Error(`artifact receipt input field is not allowed: ${key}`);
    }
  }
}

function uniqueSortedHashes(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => requireSha256(value, 'relevantExcerptHash')))].sort();
}

function requireKind(value: ArtifactReceiptKind): ArtifactReceiptKind {
  if (
    ![
      'TEST_LOG',
      'CI_LOG',
      'SCANNER_REPORT',
      'SEARCH_RESULT',
      'DEPENDENCY_REPORT',
      'TOOL_OUTPUT',
    ].includes(value)
  ) {
    throw new Error('artifact receipt kind is invalid');
  }
  return value;
}

function requireStatus(value: ArtifactReceiptStatus): ArtifactReceiptStatus {
  if (!['PASS', 'FAIL', 'PARTIAL'].includes(value)) {
    throw new Error('artifact receipt status is invalid');
  }
  return value;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireSha256(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
