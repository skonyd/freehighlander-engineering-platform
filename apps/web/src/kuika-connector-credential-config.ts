import type { FhKuikaConnectorRegistryEntryV1 } from './kuika-connector-registry.js';

export interface FhKuikaConnectorCredentialBindingV1 {
  readonly requirementRef: string;
  readonly secretHandleRef: string;
}

export interface FhKuikaConnectorCredentialConfigDraftV1 {
  readonly schemaVersion: 1;
  readonly connectorId: string;
  readonly bindings: readonly FhKuikaConnectorCredentialBindingV1[];
  readonly rawSecretValuesAccepted: false;
  readonly secretResolutionPerformed: false;
  readonly persistencePerformed: false;
  readonly activationAuthorized: false;
  readonly authority: 'NONE';
}

export function createFhKuikaConnectorCredentialConfigDraftV1(
  connector: FhKuikaConnectorRegistryEntryV1,
  bindings: readonly FhKuikaConnectorCredentialBindingV1[] = connector.secretHandleRefs.map(
    (secretHandleRef) => ({
      requirementRef: secretHandleRef,
      secretHandleRef,
    }),
  ),
): FhKuikaConnectorCredentialConfigDraftV1 {
  const requirements = new Set(connector.secretHandleRefs);
  const seen = new Set<string>();

  const normalized = bindings
    .map((binding) => {
      const requirementRef = normalizeSecretHandle(binding.requirementRef, 'requirementRef');
      const secretHandleRef = normalizeSecretHandle(binding.secretHandleRef, 'secretHandleRef');

      if (!requirements.has(requirementRef)) {
        throw new Error('credential binding requirement is not declared by connector');
      }
      if (seen.has(requirementRef)) {
        throw new Error('credential requirement can be bound only once');
      }
      seen.add(requirementRef);

      return {
        requirementRef,
        secretHandleRef,
      };
    })
    .sort((left, right) => left.requirementRef.localeCompare(right.requirementRef));

  for (const requirementRef of requirements) {
    if (!seen.has(requirementRef)) {
      throw new Error('all declared connector secret requirements must be bound');
    }
  }

  return deepFreeze({
    schemaVersion: 1,
    connectorId: connector.id,
    bindings: normalized,
    rawSecretValuesAccepted: false,
    secretResolutionPerformed: false,
    persistencePerformed: false,
    activationAuthorized: false,
    authority: 'NONE',
  });
}

export function connectorCredentialConfigCanAcceptRawSecrets(): false {
  return false;
}

export function connectorCredentialConfigCanResolveSecrets(): false {
  return false;
}

export function connectorCredentialConfigCanPersist(): false {
  return false;
}

export function connectorCredentialConfigCanActivate(): false {
  return false;
}

export function connectorCredentialConfigCanGrantAuthority(): false {
  return false;
}

function normalizeSecretHandle(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^secret:[a-zA-Z0-9._/-]+$/.test(normalized)) {
    throw new Error(field + ' must be an opaque secret:<reference> handle');
  }
  if (normalized.length > 500 || /[\r\n\t]/.test(normalized)) {
    throw new Error(field + ' must be a bounded single-line secret handle');
  }
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
