export {
  CommandSecretResolverAdapter,
  ExecFileSecretCommandRunner,
  GitHubAuthCapabilityResolverAdapter,
  LocalEnvSecretResolverAdapter,
  OsKeychainSecretResolverAdapter,
  SecretResolverRegistry,
  VaultSecretResolverAdapter,
  createDefaultSecretResolverRegistry,
  secretResolverRuntimeCanExposeSecretValues,
  secretResolverRuntimeCanGrantAuthority,
  secretResolverRuntimeCanPersistSecretValues,
  secretResolverRuntimeUsesShell,
  type SecretCommandResult,
  type SecretCommandRunner,
  type SecretMaterialInjectionRequest,
  type SecretMaterialInjectionSink,
  type SecretResolverRegistryOptions,
  type SecretResolverRuntimeAdapter,
} from './secret-resolver-runtime.js';

export {
  createSecretBindingProfileV1,
  createSecretBindingV1,
  createSecretRequirementV1,
  evaluateSecretBindingStatusV1,
  secretBindingCanContainSecretValues,
  secretBindingCanExportCredentialMaterial,
  secretBindingCanGrantAuthority,
  validateSecretBindingProfileV1,
  validateSecretBindingV1,
  validateSecretRequirementV1,
  type SecretBindingProfileV1,
  type SecretBindingStatusV1,
  type SecretBindingStorage,
  type SecretBindingV1,
  type SecretRequirementResolutionV1,
  type SecretRequirementStatus,
  type SecretRequirementV1,
  type SecretResolverEvidenceV1,
  type SecretResolverHealth,
  type SecretResolverKind,
} from './portable-secret-binding.js';

export {
  prepareProviderEgress,
  providerEgressPreparationCanGrantAuthority,
  providerEgressPreparationCanInvokeProvider,
  validateProviderEgressPreparationRequest,
  type JsonValue,
  type ProviderEgressCandidatePacket,
  type ProviderEgressPreparation,
  type ProviderEgressPreparationRequest,
  type ProviderEgressPreparationValidation,
  type ProviderEgressReasonCode,
  type ProviderEgressTelemetryPayload,
} from './provider-egress-preparation.js';

export {
  buildPrivacyLifecycleManifest,
  privacyManifestCanDeleteAuditData,
  privacyManifestCanDeleteData,
  privacyManifestCanExportData,
  validatePrivacyLifecycleRecords,
  validatePrivacyLifecycleRequest,
  type PrivacyLifecycleManifest,
  type PrivacyLifecycleRecord,
  type PrivacyLifecycleRequest,
  type PrivacyManifestDisposition,
  type PrivacyManifestEntry,
  type PrivacyManifestKind,
  type PrivacyValidationResult,
} from './privacy-lifecycle.js';

export {
  evaluateSecretAccess,
  planSecretInjection,
  promptCanRequestRawSecretValue,
  secretBrokerCanGrantAuthority,
  secretValueCanBePersisted,
  secretValueCanReachRemoteModel,
  validateSecretHandle,
  validateSecretInjectionReceipt,
  type SecretAccessDecision,
  type SecretAccessRequest,
  type SecretBackendKind,
  type SecretBrokerAdapter,
  type SecretHandle,
  type SecretInjectionPlan,
  type SecretInjectionPlanningResult,
  type SecretInjectionReceipt,
  type SecretInjectionTarget,
  type SecretValidationResult,
} from './secret-broker.js';

export {
  buildRetentionPlan,
  retentionPlanCanDeleteAuditData,
  retentionPlanCanDeleteData,
  validateRetentionRecords,
  type RetentionAction,
  type RetentionDecision,
  type RetentionPlan,
  type RetentionRecord,
} from './retention-policy.js';

export {
  evaluateSandboxPermission,
  isWithinRepository,
  modelIdentityCanExpandSandboxPermissions,
  parseSandboxPolicyYaml,
  promptCanExpandSandboxPermissions,
  sandboxPolicyCanGrantAuthority,
  validateSandboxPolicy,
  type SandboxCapability,
  type SandboxPermissionDecision,
  type SandboxPermissionRequest,
  type SandboxPolicy,
} from './sandbox-policy.js';

export {
  dataPolicyCanAllowSecretRemoteEgress,
  dataPolicyCanGrantAuthority,
  evaluateProviderEgress,
  evaluateRawCapture,
  parseDataPolicyYaml,
  redactSensitive,
  sanitizeForPersistence,
  validateDataPolicy,
  type DataPolicy,
  type ProviderEgressDecision,
  type ProviderEgressRequest,
  type RawCaptureDecision,
  type RawCaptureRequest,
  type RemoteAllowance,
  type RetentionClass,
} from './data-policy.js';

export {
  cutoverCanBypassFinalReferenceAcceptance,
  cutoverReadinessCanEnableAuthority,
  evaluateV3CutoverReadiness,
  type CutoverReadinessInput,
  type CutoverReadinessResult,
  type CutoverReadinessStatus,
} from './cutover-readiness.js';

export {
  createHumanApprovalRequest,
  evaluatePolicy,
  modelCanActAsHumanApprover,
  policyConfigurationCanSelfApprove,
  publishPolicy,
  recordHumanDecision,
  validatePolicyDefinition,
  verifyHumanDecisionBinding,
  type DataClassification,
  type HumanApprovalRequest,
  type HumanApprovalRequestInput,
  type HumanDecision,
  type HumanDecisionValue,
  type PolicyDecision,
  type PolicyDefinition,
  type PolicyEffect,
  type PolicyInput,
  type PolicyPrincipalKind,
  type PolicyRule,
  type PublishedPolicy,
} from './policy-engine.js';

export {
  RoleRegistry,
  roleRegistryCanGrantAuthority,
  roleSupportsRiskTier,
  toolPermission,
  type RolePrincipalKind,
  type RoleRegistrationPolicy,
  type RoleSnapshot,
  type ToolPermission,
} from './role-registry.js';

export type AuthorityLevel =
  | 'ADVISORY'
  | 'CANDIDATE'
  | 'WRITER'
  | 'ADJUDICATOR'
  | 'FINAL_REVIEWER'
  | 'HUMAN_APPROVER'
  | 'SYSTEM_POLICY';

export type PrincipalKind = 'MODEL' | 'HUMAN' | 'SYSTEM';

export interface AuthorityDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export function evaluateAuthority(
  principal: PrincipalKind,
  requestedAuthority: AuthorityLevel,
): AuthorityDecision {
  if (requestedAuthority === 'HUMAN_APPROVER' && principal !== 'HUMAN') {
    return { allowed: false, reason: 'HUMAN_APPROVER requires a human principal' };
  }

  if (requestedAuthority === 'SYSTEM_POLICY' && principal !== 'SYSTEM') {
    return { allowed: false, reason: 'SYSTEM_POLICY requires a system principal' };
  }

  return { allowed: true, reason: 'authority is compatible with the principal kind' };
}

export function canFallbackAfterFailure(
  failure:
    | 'quota_exhausted'
    | 'rate_limited'
    | 'auth_unavailable'
    | 'provider_unavailable'
    | 'transport_failure'
    | 'semantic_failure'
    | 'malformed_output',
): boolean {
  return new Set([
    'quota_exhausted',
    'rate_limited',
    'auth_unavailable',
    'provider_unavailable',
    'transport_failure',
  ]).has(failure);
}
