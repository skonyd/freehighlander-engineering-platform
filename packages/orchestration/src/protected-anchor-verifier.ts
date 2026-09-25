import { createHash } from 'node:crypto';

export interface ProtectedContextAnchor {
  readonly id: string;
  readonly value: string;
  readonly minimumOccurrences?: number;
}

export interface ProtectedAnchorVerificationInput {
  readonly sourceText: string;
  readonly optimizedText: string;
  readonly anchors: readonly ProtectedContextAnchor[];
}

export type ProtectedAnchorVerificationStatus = 'PASS' | 'FAIL';

export interface ProtectedAnchorCheck {
  readonly id: string;
  readonly valueHash: string;
  readonly minimumOccurrences: number;
  readonly sourceOccurrences: number;
  readonly optimizedOccurrences: number;
  readonly preserved: boolean;
}

export interface ProtectedAnchorVerification {
  readonly schemaVersion: 1;
  readonly status: ProtectedAnchorVerificationStatus;
  readonly sourceHash: string;
  readonly optimizedHash: string;
  readonly anchorSetHash: string;
  readonly checks: readonly ProtectedAnchorCheck[];
  readonly missingSourceAnchorIds: readonly string[];
  readonly missingOptimizedAnchorIds: readonly string[];
  readonly remoteInvocationAllowed: boolean;
  readonly verificationHash: string;
  readonly authority: 'NONE';
}

export function verifyProtectedContextAnchors(
  input: ProtectedAnchorVerificationInput,
): ProtectedAnchorVerification {
  if (input.anchors.length === 0) {
    throw new Error('protected anchor verification requires at least one anchor');
  }

  const normalizedAnchors = input.anchors
    .map((anchor) => normalizeAnchor(anchor))
    .sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueAnchorIds(normalizedAnchors);

  const checks = normalizedAnchors.map((anchor) => {
    const sourceOccurrences = countExactOccurrences(input.sourceText, anchor.value);
    const optimizedOccurrences = countExactOccurrences(input.optimizedText, anchor.value);
    return {
      id: anchor.id,
      valueHash: sha256(anchor.value),
      minimumOccurrences: anchor.minimumOccurrences,
      sourceOccurrences,
      optimizedOccurrences,
      preserved:
        sourceOccurrences >= anchor.minimumOccurrences &&
        optimizedOccurrences >= anchor.minimumOccurrences,
    } satisfies ProtectedAnchorCheck;
  });

  const missingSourceAnchorIds = checks
    .filter((check) => check.sourceOccurrences < check.minimumOccurrences)
    .map((check) => check.id);
  const missingOptimizedAnchorIds = checks
    .filter((check) => check.optimizedOccurrences < check.minimumOccurrences)
    .map((check) => check.id);

  const status: ProtectedAnchorVerificationStatus =
    missingSourceAnchorIds.length === 0 && missingOptimizedAnchorIds.length === 0 ? 'PASS' : 'FAIL';

  const sourceHash = sha256(input.sourceText);
  const optimizedHash = sha256(input.optimizedText);
  const anchorSetHash = sha256(
    canonicalJson(
      normalizedAnchors.map((anchor) => ({
        id: anchor.id,
        valueHash: sha256(anchor.value),
        minimumOccurrences: anchor.minimumOccurrences,
      })),
    ),
  );

  const identity = {
    schemaVersion: 1,
    status,
    sourceHash,
    optimizedHash,
    anchorSetHash,
    checks,
    missingSourceAnchorIds,
    missingOptimizedAnchorIds,
    remoteInvocationAllowed: status === 'PASS',
  } as const;

  return {
    ...identity,
    verificationHash: sha256(canonicalJson(identity)),
    authority: 'NONE',
  };
}

export function assertProtectedContextAnchors(
  verification: ProtectedAnchorVerification,
): void {
  validateProtectedAnchorVerification(verification);
  if (verification.status !== 'PASS') {
    const missing = [
      ...verification.missingSourceAnchorIds.map((id) => `source:${id}`),
      ...verification.missingOptimizedAnchorIds.map((id) => `optimized:${id}`),
    ];
    throw new Error(`protected context anchor verification failed: ${missing.join(', ')}`);
  }
}

export function validateProtectedAnchorVerification(
  verification: ProtectedAnchorVerification,
): void {
  if (verification.schemaVersion !== 1) {
    throw new Error('protected anchor verification schemaVersion must be 1');
  }
  if (verification.authority !== 'NONE') {
    throw new Error('protected anchor verification authority must be NONE');
  }
  for (const [field, value] of [
    ['sourceHash', verification.sourceHash],
    ['optimizedHash', verification.optimizedHash],
    ['anchorSetHash', verification.anchorSetHash],
    ['verificationHash', verification.verificationHash],
  ] as const) {
    requireSha256(value, field);
  }

  const expectedStatus: ProtectedAnchorVerificationStatus =
    verification.missingSourceAnchorIds.length === 0 &&
    verification.missingOptimizedAnchorIds.length === 0
      ? 'PASS'
      : 'FAIL';
  if (verification.status !== expectedStatus) {
    throw new Error('protected anchor verification status mismatch');
  }
  if (verification.remoteInvocationAllowed !== (verification.status === 'PASS')) {
    throw new Error('protected anchor remote invocation decision mismatch');
  }

  const identity = {
    schemaVersion: 1,
    status: verification.status,
    sourceHash: verification.sourceHash,
    optimizedHash: verification.optimizedHash,
    anchorSetHash: verification.anchorSetHash,
    checks: verification.checks,
    missingSourceAnchorIds: verification.missingSourceAnchorIds,
    missingOptimizedAnchorIds: verification.missingOptimizedAnchorIds,
    remoteInvocationAllowed: verification.remoteInvocationAllowed,
  } as const;
  if (sha256(canonicalJson(identity)) !== verification.verificationHash) {
    throw new Error('protected anchor verification hash mismatch');
  }
}

export function protectedAnchorVerifierCanGrantAuthority(): false {
  return false;
}

export function tokenEconomyCanInvokeRemoteWithMissingProtectedAnchor(): false {
  return false;
}

function normalizeAnchor(
  anchor: ProtectedContextAnchor,
): Required<ProtectedContextAnchor> {
  const id = requireText(anchor.id, 'protected anchor id');
  const value = requireText(anchor.value, `protected anchor ${id} value`);
  const minimumOccurrences = anchor.minimumOccurrences ?? 1;
  if (!Number.isInteger(minimumOccurrences) || minimumOccurrences < 1) {
    throw new Error(`protected anchor ${id} minimumOccurrences must be >= 1`);
  }
  return { id, value, minimumOccurrences };
}

function assertUniqueAnchorIds(anchors: readonly Required<ProtectedContextAnchor>[]): void {
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (seen.has(anchor.id)) {
      throw new Error(`duplicate protected anchor id: ${anchor.id}`);
    }
    seen.add(anchor.id);
  }
}

function countExactOccurrences(text: string, value: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= text.length - value.length) {
    const index = text.indexOf(value, offset);
    if (index === -1) break;
    count += 1;
    offset = index + value.length;
  }
  return count;
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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
