export type ParityDimension = 'route' | 'gate' | 'artifact' | 'state' | 'failure' | 'outcome';

export type V2ReferenceStatus = 'PROVISIONAL' | 'ACCEPTED';

export interface ParityBinding {
  readonly repository: string;
  readonly headSha: string;
  readonly workflowHash: string;
  readonly policyHash: string;
  readonly artifactRootHash: string;
  readonly authoritativeInputHash: string;
}

export interface ParityObservation {
  readonly route?: string | null;
  readonly gate?: string | null;
  readonly artifact?: string | null;
  readonly state?: string | null;
  readonly failure?: string | null;
  readonly outcome?: string | null;
}

export interface ShadowParityCase {
  readonly caseId: string;
  readonly referenceRepository: string;
  readonly referenceSha: string;
  readonly referenceStatus: V2ReferenceStatus;
  readonly binding: ParityBinding;
  readonly v2: ParityObservation;
  readonly v3: ParityObservation;
  readonly excludedReason?: string;
  readonly unavailableReason?: string;
}

export type ParityDimensionStatus = 'MATCH' | 'MISMATCH' | 'MISSING_EVIDENCE';

export interface ParityDimensionResult {
  readonly dimension: ParityDimension;
  readonly status: ParityDimensionStatus;
  readonly v2: string | null;
  readonly v3: string | null;
}

export type ShadowParityStatus =
  | 'PASS'
  | 'MISMATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXCLUDED'
  | 'UNAVAILABLE';

export interface ShadowParityReport {
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly caseHash: string;
  readonly referenceRepository: string;
  readonly referenceSha: string;
  readonly referenceStatus: V2ReferenceStatus;
  readonly binding: ParityBinding;
  readonly status: ShadowParityStatus;
  readonly dimensions: readonly ParityDimensionResult[];
  readonly authorityGranted: false;
  readonly cutoverAllowed: false;
  readonly detail?: string;
}

const dimensions: readonly ParityDimension[] = [
  'route',
  'gate',
  'artifact',
  'state',
  'failure',
  'outcome',
];

export async function buildShadowParityReport(
  input: ShadowParityCase,
): Promise<ShadowParityReport> {
  validateCase(input);

  const caseHash = await sha256Hex(
    canonicalJson({
      caseId: input.caseId,
      referenceRepository: input.referenceRepository,
      referenceSha: input.referenceSha,
      referenceStatus: input.referenceStatus,
      binding: input.binding,
    }),
  );

  if (input.excludedReason !== undefined) {
    requireText(input.excludedReason, 'excludedReason');
    return report(input, caseHash, 'EXCLUDED', [], input.excludedReason);
  }
  if (input.unavailableReason !== undefined) {
    requireText(input.unavailableReason, 'unavailableReason');
    return report(input, caseHash, 'UNAVAILABLE', [], input.unavailableReason);
  }

  const results = dimensions.map((dimension): ParityDimensionResult => {
    const v2 = normalize(input.v2[dimension]);
    const v3 = normalize(input.v3[dimension]);
    return {
      dimension,
      status:
        v2 === null || v3 === null ? 'MISSING_EVIDENCE' : v2 === v3 ? 'MATCH' : 'MISMATCH',
      v2,
      v3,
    };
  });

  const status: ShadowParityStatus = results.some((entry) => entry.status === 'MISSING_EVIDENCE')
    ? 'INSUFFICIENT_EVIDENCE'
    : results.some((entry) => entry.status === 'MISMATCH')
      ? 'MISMATCH'
      : 'PASS';

  return report(input, caseHash, status, results);
}

export function parityCanGrantAuthority(): false {
  return false;
}

export function parityCanCutOverV3(): false {
  return false;
}

function report(
  input: ShadowParityCase,
  caseHash: string,
  status: ShadowParityStatus,
  results: readonly ParityDimensionResult[],
  detail?: string,
): ShadowParityReport {
  return {
    schemaVersion: 1,
    caseId: input.caseId,
    caseHash,
    referenceRepository: input.referenceRepository,
    referenceSha: input.referenceSha,
    referenceStatus: input.referenceStatus,
    binding: input.binding,
    status,
    dimensions: results,
    authorityGranted: false,
    cutoverAllowed: false,
    ...(detail === undefined ? {} : { detail }),
  };
}

function validateCase(input: ShadowParityCase): void {
  requireText(input.caseId, 'caseId');
  requireText(input.referenceRepository, 'referenceRepository');
  requireText(input.referenceSha, 'referenceSha');
  requireText(input.binding.repository, 'binding.repository');
  requireText(input.binding.headSha, 'binding.headSha');
  requireText(input.binding.workflowHash, 'binding.workflowHash');
  requireText(input.binding.policyHash, 'binding.policyHash');
  requireText(input.binding.artifactRootHash, 'binding.artifactRootHash');
  requireText(input.binding.authoritativeInputHash, 'binding.authoritativeInputHash');
  if (input.excludedReason !== undefined && input.unavailableReason !== undefined) {
    throw new Error('parity case cannot be both excluded and unavailable');
  }
}

function normalize(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value;
}

function requireText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
