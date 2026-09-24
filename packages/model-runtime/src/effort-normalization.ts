export type CanonicalEffort = 'default' | 'none' | 'low' | 'medium' | 'high' | 'extra-high';

export interface ProviderEffortResolutionOptions {
  readonly supportedEfforts?: readonly string[];
  readonly nativeMapping?: Readonly<Record<string, string | null>>;
}

export interface ProviderEffortResolution {
  readonly requested: string;
  readonly normalized: string;
  readonly nativeValue?: string;
  readonly omitted: boolean;
}

export function normalizeEffortValue(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (!normalized) throw new Error('effort is required');
  return normalized === 'xhigh' ? 'extra-high' : normalized;
}

export function resolveProviderEffort(
  requested: string,
  options: ProviderEffortResolutionOptions = {},
): ProviderEffortResolution {
  const normalized = normalizeEffortValue(requested);
  if (normalized === 'default' || normalized === 'none') {
    return { requested, normalized, omitted: true };
  }

  const supported = (options.supportedEfforts ?? []).map(normalizeEffortValue);

  if (supported.length > 0 && !supported.includes(normalized)) {
    throw new Error(`unsupported effort: ${normalized}`);
  }

  const mapping = options.nativeMapping ?? {};
  let mapped: string | null = normalized;
  if (Object.prototype.hasOwnProperty.call(mapping, normalized)) {
    const configured = mapping[normalized];
    if (configured === undefined) {
      throw new Error(`native effort mapping for ${normalized} is undefined`);
    }
    mapped = configured;
  }

  if (mapped === null) {
    return { requested, normalized, omitted: true };
  }

  const nativeValue = mapped.trim();
  if (!nativeValue) throw new Error(`native effort mapping for ${normalized} is empty`);
  return {
    requested,
    normalized,
    nativeValue,
    omitted: false,
  };
}

export function canonicalEffortChoices(): readonly CanonicalEffort[] {
  return ['default', 'none', 'low', 'medium', 'high', 'extra-high'];
}

export function effortNormalizationCanGrantAuthority(): false {
  return false;
}
