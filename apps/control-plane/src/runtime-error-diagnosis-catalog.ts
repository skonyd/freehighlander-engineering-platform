import {
  createRuntimeErrorReport,
  type RuntimeErrorReportV1,
  type RuntimeErrorSeverity,
} from './runtime-error-reporting.js';

export type KnownRuntimeFailureKind =
  | 'VALIDATION_FAILURE'
  | 'CONFIGURATION_FAILURE'
  | 'POLICY_DENIED'
  | 'SECRET_BINDING_MISSING'
  | 'WORKSPACE_IDENTITY_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'COMMAND_FAILED'
  | 'ACTIVITY_TIMEOUT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_INVARIANT';

export interface KnownRuntimeFailureInput {
  readonly kind: KnownRuntimeFailureKind;
  readonly component: string;
  readonly operation: string;
  readonly failedStep: string;
  readonly subject: string;
  readonly observedSignal: string;
  readonly correlationId?: string;
  readonly retryAt?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

interface FailureTemplate {
  readonly code: string;
  readonly causeCode: string;
  readonly causeKind:
    | 'VALIDATION'
    | 'CONFIGURATION'
    | 'POLICY'
    | 'SECRET_BINDING'
    | 'WORKSPACE_STATE'
    | 'REVISION_CONFLICT'
    | 'COMMAND_EXIT'
    | 'TIMEOUT'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'INTERNAL_INVARIANT';
  readonly headline: string;
  readonly severity: RuntimeErrorSeverity;
  readonly retryable: boolean;
  rootCause(subject: string): string;
  nextAction(subject: string): string;
}

const templates: Readonly<Record<KnownRuntimeFailureKind, FailureTemplate>> = {
  VALIDATION_FAILURE: {
    code: 'VALIDATION_FAILED',
    causeCode: 'INPUT_VALIDATION_FAILED',
    causeKind: 'VALIDATION',
    headline: 'Input validation failed',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Validation rejected ${subject} because it does not satisfy the required contract.`,
    nextAction: (subject) => `Correct ${subject} and submit the operation again`,
  },
  CONFIGURATION_FAILURE: {
    code: 'CONFIGURATION_INVALID',
    causeCode: 'CONFIGURATION_INVALID',
    causeKind: 'CONFIGURATION',
    headline: 'Configuration is invalid',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Configuration ${subject} is invalid or unavailable for this operation.`,
    nextAction: (subject) => `Correct configuration ${subject} before retrying`,
  },
  POLICY_DENIED: {
    code: 'POLICY_DENIED',
    causeCode: 'SYSTEM_POLICY_DENIED',
    causeKind: 'POLICY',
    headline: 'System policy denied the operation',
    severity: 'WARNING',
    retryable: false,
    rootCause: (subject) => `System policy denied ${subject}; execution was not authorized.`,
    nextAction: (subject) => `Review the policy decision for ${subject} or obtain the required approval`,
  },
  SECRET_BINDING_MISSING: {
    code: 'SECRET_BINDING_MISSING',
    causeCode: 'REQUIRED_SECRET_BINDING_MISSING',
    causeKind: 'SECRET_BINDING',
    headline: 'Required secret binding is missing',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Required secret binding ${subject} is not available to the execution boundary.`,
    nextAction: (subject) => `Configure or restore secret binding ${subject} before retrying`,
  },
  WORKSPACE_IDENTITY_MISMATCH: {
    code: 'WORKSPACE_INVALID',
    causeCode: 'WORKSPACE_IDENTITY_MISMATCH',
    causeKind: 'WORKSPACE_STATE',
    headline: 'Execution workspace is stale',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Workspace ${subject} no longer matches the required run or revision identity.`,
    nextAction: (subject) => `Recreate or reattach workspace ${subject} using the current run identity`,
  },
  REVISION_CONFLICT: {
    code: 'REVISION_CONFLICT',
    causeCode: 'EXPECTED_REVISION_MISMATCH',
    causeKind: 'REVISION_CONFLICT',
    headline: 'Repository revision changed',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Revision ${subject} no longer matches the revision required by this operation.`,
    nextAction: (subject) => `Refresh the repository state for ${subject} and recompute current evidence`,
  },
  COMMAND_FAILED: {
    code: 'COMMAND_FAILED',
    causeCode: 'REGISTERED_COMMAND_FAILED',
    causeKind: 'COMMAND_EXIT',
    headline: 'Registered command failed',
    severity: 'ERROR',
    retryable: false,
    rootCause: (subject) => `Registered command ${subject} completed with a failure result.`,
    nextAction: (subject) => `Inspect the safe command evidence for ${subject} and correct the failing step`,
  },
  ACTIVITY_TIMEOUT: {
    code: 'ACTIVITY_TIMEOUT',
    causeCode: 'ACTIVITY_DEADLINE_EXCEEDED',
    causeKind: 'TIMEOUT',
    headline: 'Activity timed out',
    severity: 'ERROR',
    retryable: true,
    rootCause: (subject) => `Activity ${subject} exceeded its allowed execution deadline.`,
    nextAction: (subject) => `Retry activity ${subject} only if its idempotency and remaining deadline allow it`,
  },
  DEPENDENCY_UNAVAILABLE: {
    code: 'DEPENDENCY_UNAVAILABLE',
    causeCode: 'DEPENDENCY_UNAVAILABLE',
    causeKind: 'DEPENDENCY_UNAVAILABLE',
    headline: 'Required dependency is unavailable',
    severity: 'ERROR',
    retryable: true,
    rootCause: (subject) => `Dependency ${subject} is not currently available to complete this operation.`,
    nextAction: (subject) => `Retry after dependency ${subject} becomes healthy`,
  },
  INTERNAL_INVARIANT: {
    code: 'INTERNAL_INVARIANT_FAILED',
    causeCode: 'INTERNAL_INVARIANT_FAILED',
    causeKind: 'INTERNAL_INVARIANT',
    headline: 'Internal invariant failed',
    severity: 'CRITICAL',
    retryable: false,
    rootCause: (subject) => `Internal invariant ${subject} failed and execution stopped fail-closed.`,
    nextAction: (subject) => `Inspect correlation evidence for invariant ${subject} before resuming execution`,
  },
};

export function createKnownRuntimeFailureReport(
  input: KnownRuntimeFailureInput,
): RuntimeErrorReportV1 {
  const template = templates[input.kind];
  if (template === undefined) {
    throw new Error('known runtime failure kind is unsupported');
  }

  const subject = normalizeSubject(input.subject);
  if (input.retryAt !== undefined && !template.retryable) {
    throw new Error('retryAt is only valid for retryable known runtime failures');
  }

  return createRuntimeErrorReport({
    code: template.code,
    userMessage: template.headline,
    severity: template.severity,
    operation: input.operation,
    retryable: template.retryable,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.details === undefined ? {} : { details: input.details }),
    diagnosis: {
      causeCode: template.causeCode,
      causeKind: template.causeKind,
      certainty: 'DETERMINISTIC_RULE',
      headline: template.headline,
      sourceComponent: input.component,
      sourceOperation: input.operation,
      failedStep: input.failedStep,
      rootCause: template.rootCause(subject),
      observedSignal: input.observedSignal,
      nextAction: template.nextAction(subject),
      ...(input.retryAt === undefined ? {} : { retryAt: input.retryAt }),
      redactionStatus: 'APPLIED',
    },
  });
}

export function knownRuntimeFailureCatalogCanGrantAuthority(): false {
  return false;
}

function normalizeSubject(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length < 2 || normalized.length > 120) {
    throw new Error('known runtime failure subject length is invalid');
  }
  return normalized;
}
