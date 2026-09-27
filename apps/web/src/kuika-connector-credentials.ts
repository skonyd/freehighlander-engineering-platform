export interface FhKuikaConnectorCredentialBindingV1 {
  readonly connectorId: string;
  readonly slot: string;
  readonly secretHandleRef: string;
}

export interface FhKuikaConnectorCredentialConfigV1 {
  readonly schemaVersion: 1;
  readonly connectorId: string;
  readonly bindings: readonly FhKuikaConnectorCredentialBindingV1[];
  readonly rawSecretsAccepted: false;
  readonly persistenceContainsSecretValues: false;
  readonly activationAuthorized: false;
  readonly authority: 'NONE';
}

export function createFhKuikaConnectorCredentialConfigV1(input: {
  readonly connectorId: string;
  readonly bindings: readonly {
    readonly slot: string;
    readonly secretHandleRef: string;
  }[];
}): FhKuikaConnectorCredentialConfigV1 {
  const connectorId = requireIdentifier(input.connectorId, 'connector id');
  const seen = new Set<string>();

  const bindings = input.bindings
    .map((binding) => {
      const slot = requireIdentifier(binding.slot, 'credential slot');
      if (seen.has(slot)) throw new Error('credential slots must be unique');
      seen.add(slot);

      const secretHandleRef = requireSingleLine(binding.secretHandleRef, 'secret handle');
      if (!/^secret:[a-zA-Z0-9._/-]+$/.test(secretHandleRef)) {
        throw new Error('credential binding must use secret:<reference>');
      }

      return { connectorId, slot, secretHandleRef };
    })
    .sort((a, b) => a.slot.localeCompare(b.slot));

  return {
    schemaVersion: 1,
    connectorId,
    bindings,
    rawSecretsAccepted: false,
    persistenceContainsSecretValues: false,
    activationAuthorized: false,
    authority: 'NONE',
  };
}

export function connectorCredentialConfigCanAcceptRawSecret(): false {
  return false;
}

export function connectorCredentialConfigCanActivate(): false {
  return false;
}

export function connectorCredentialConfigCanGrantAuthority(): false {
  return false;
}

function requireIdentifier(value: string, field: string): string {
  const normalized = requireSingleLine(value, field);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(field + ' must use a bounded lowercase identifier');
  }
  return normalized;
}

function requireSingleLine(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' is required');
  if (/[
	]/.test(normalized) || normalized.length > 500) {
    throw new Error(field + ' must be a bounded single-line value');
  }
  return normalized;
}
