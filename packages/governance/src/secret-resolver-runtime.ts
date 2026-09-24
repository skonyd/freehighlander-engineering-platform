import { execFile } from 'node:child_process';

import {
  validateSecretBindingV1,
  type SecretBindingV1,
  type SecretResolverEvidenceV1,
  type SecretResolverKind,
} from './portable-secret-binding.js';
import {
  validateSecretInjectionReceipt,
  type SecretBackendKind,
  type SecretInjectionPlan,
  type SecretInjectionReceipt,
} from './secret-broker.js';

export interface SecretMaterialInjectionRequest {
  readonly plan: SecretInjectionPlan;
  readonly resolverKind: SecretResolverKind;
  readonly value: string;
  readonly resolverLeaseExpiresAt?: string;
}

export interface SecretMaterialInjectionSink {
  inject(request: SecretMaterialInjectionRequest): Promise<SecretInjectionReceipt>;
  revoke(receiptId: string): Promise<void>;
}

export interface SecretResolverRuntimeAdapter {
  readonly kind: SecretResolverKind;
  probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1>;
  inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt>;
  revoke?(receiptId: string, sink: SecretMaterialInjectionSink): Promise<void>;
}

export interface SecretCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
}

export interface SecretCommandRunner {
  run(executable: string, args: readonly string[], timeoutMs: number): Promise<SecretCommandResult>;
}

export interface SecretResolverRegistryOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly commandRunner?: SecretCommandRunner;
  readonly commandTimeoutMs?: number;
  readonly externalBroker?: SecretResolverRuntimeAdapter;
}

interface ResolvedSecretMaterial {
  readonly value: string;
  readonly resolverLeaseId?: string;
  readonly resolverLeaseExpiresAt?: string;
}

interface ReceiptLeaseBinding {
  readonly kind: SecretResolverKind;
  readonly resolverLeaseId: string;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

export class SecretResolverRegistry {
  readonly #adapters = new Map<SecretResolverKind, SecretResolverRuntimeAdapter>();

  register(adapter: SecretResolverRuntimeAdapter): void {
    if (this.#adapters.has(adapter.kind)) {
      throw new Error(`duplicate secret resolver adapter: ${adapter.kind}`);
    }
    this.#adapters.set(adapter.kind, adapter);
  }

  get(kind: SecretResolverKind): SecretResolverRuntimeAdapter {
    const adapter = this.#adapters.get(kind);
    if (!adapter) throw new Error(`secret resolver adapter is unavailable: ${kind}`);
    return adapter;
  }

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    validateSecretBindingV1(binding);
    return this.get(binding.resolverKind).probe(binding);
  }

  async probeAll(bindings: readonly SecretBindingV1[]): Promise<readonly SecretResolverEvidenceV1[]> {
    const evidence: SecretResolverEvidenceV1[] = [];
    for (const binding of bindings) evidence.push(await this.probe(binding));
    return evidence.sort((left, right) => {
      const kindOrder = left.resolverKind.localeCompare(right.resolverKind);
      if (kindOrder !== 0) return kindOrder;
      return (left.handleId ?? '').localeCompare(right.handleId ?? '');
    });
  }

  async inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    validateSecretBindingV1(binding);
    return this.get(binding.resolverKind).inject(binding, plan, sink);
  }

  async revoke(
    binding: SecretBindingV1,
    receiptId: string,
    sink: SecretMaterialInjectionSink,
  ): Promise<void> {
    validateSecretBindingV1(binding);
    const adapter = this.get(binding.resolverKind);
    if (adapter.revoke) {
      await adapter.revoke(receiptId, sink);
      return;
    }
    await sink.revoke(receiptId);
  }
}

export function createDefaultSecretResolverRegistry(
  options: SecretResolverRegistryOptions = {},
): SecretResolverRegistry {
  const registry = new SecretResolverRegistry();
  const runner = options.commandRunner ?? new ExecFileSecretCommandRunner();
  const timeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;

  registry.register(new LocalEnvSecretResolverAdapter(environment));
  registry.register(new OsKeychainSecretResolverAdapter(platform, runner, timeoutMs));
  registry.register(
    new CommandSecretResolverAdapter('ONEPASSWORD', runner, timeoutMs, onePasswordCommand),
  );
  registry.register(
    new CommandSecretResolverAdapter(
      'BITWARDEN_SECRETS_MANAGER',
      runner,
      timeoutMs,
      bitwardenCommand,
    ),
  );
  registry.register(new VaultSecretResolverAdapter(runner, timeoutMs));
  registry.register(new GitHubAuthCapabilityResolverAdapter(runner, timeoutMs));
  if (options.externalBroker) registry.register(options.externalBroker);
  return registry;
}

export class ExecFileSecretCommandRunner implements SecretCommandRunner {
  async run(
    executable: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<SecretCommandResult> {
    requireExecutable(executable);
    requireTimeout(timeoutMs);
    for (const arg of args) requireArgument(arg);

    return new Promise((resolve) => {
      execFile(
        executable,
        [...args],
        {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          shell: false,
        },
        (error, stdout) => {
          if (error) {
            resolve({ exitCode: exitCodeFromError(error), stdout: '' });
            return;
          }
          resolve({
            exitCode: 0,
            stdout: typeof stdout === 'string' ? stdout : stdout.toString('utf8'),
          });
        },
      );
    });
  }
}

export class LocalEnvSecretResolverAdapter implements SecretResolverRuntimeAdapter {
  readonly kind = 'LOCAL_ENV' as const;

  constructor(readonly environment: Readonly<Record<string, string | undefined>>) {}

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    assertBindingKind(binding, this.kind);
    const reference = requireReference(binding);
    const value = this.environment[reference];
    return evidence(
      binding,
      typeof value === 'string' && value.length > 0 ? 'HEALTHY' : 'UNAVAILABLE',
      true,
      ['EPHEMERAL_INJECTION'],
    );
  }

  async inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    assertBindingPlan(binding, plan);
    const reference = requireReference(binding);
    const value = this.environment[reference];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('LOCAL_ENV secret reference is unresolved');
    }
    return injectAndValidate(binding, plan, sink, { value });
  }
}

export class OsKeychainSecretResolverAdapter implements SecretResolverRuntimeAdapter {
  readonly kind = 'OS_KEYCHAIN' as const;

  constructor(
    readonly platform: NodeJS.Platform,
    readonly runner: SecretCommandRunner,
    readonly timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  ) {
    requireTimeout(timeoutMs);
  }

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    assertBindingKind(binding, this.kind);
    const command = osKeychainCommand(this.platform, requireReference(binding));
    if (command === null) return evidence(binding, 'UNAVAILABLE', null, []);
    const result = await this.runner.run(command.executable, command.probeArgs, this.timeoutMs);
    return evidence(
      binding,
      result.exitCode === 0 ? 'HEALTHY' : 'UNAVAILABLE',
      result.exitCode === 0,
      result.exitCode === 0 ? ['EPHEMERAL_INJECTION'] : [],
    );
  }

  async inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    assertBindingPlan(binding, plan);
    const command = osKeychainCommand(this.platform, requireReference(binding));
    if (command === null) throw new Error('secure OS keychain backend is unavailable');
    const result = await this.runner.run(command.executable, command.readArgs, this.timeoutMs);
    const value = requireSuccessfulSecretResult(result, 'OS_KEYCHAIN');
    return injectAndValidate(binding, plan, sink, { value });
  }
}

export class CommandSecretResolverAdapter implements SecretResolverRuntimeAdapter {
  constructor(
    readonly kind: 'ONEPASSWORD' | 'BITWARDEN_SECRETS_MANAGER',
    readonly runner: SecretCommandRunner,
    readonly timeoutMs: number,
    readonly commandBuilder: (
      reference: string,
    ) => {
      readonly executable: string;
      readonly probeArgs: readonly string[];
      readonly readArgs: readonly string[];
      parseValue(stdout: string): string;
    },
  ) {
    requireTimeout(timeoutMs);
  }

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    assertBindingKind(binding, this.kind);
    const command = this.commandBuilder(requireReference(binding));
    const result = await this.runner.run(command.executable, command.probeArgs, this.timeoutMs);
    return evidence(
      binding,
      result.exitCode === 0 ? 'HEALTHY' : 'UNAVAILABLE',
      result.exitCode === 0,
      result.exitCode === 0 ? ['EPHEMERAL_INJECTION'] : [],
    );
  }

  async inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    assertBindingPlan(binding, plan);
    const command = this.commandBuilder(requireReference(binding));
    const result = await this.runner.run(command.executable, command.readArgs, this.timeoutMs);
    if (result.exitCode !== 0) throw new Error(`${this.kind} secret resolution failed`);
    const value = command.parseValue(result.stdout);
    if (!value) throw new Error(`${this.kind} secret resolution returned no value`);
    return injectAndValidate(binding, plan, sink, { value });
  }
}

export class VaultSecretResolverAdapter implements SecretResolverRuntimeAdapter {
  readonly kind = 'HASHICORP_VAULT' as const;
  readonly #leases = new Map<string, string>();

  constructor(
    readonly runner: SecretCommandRunner,
    readonly timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  ) {
    requireTimeout(timeoutMs);
  }

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    assertBindingKind(binding, this.kind);
    const result = await this.runner.run('vault', ['status', '-format=json'], this.timeoutMs);
    return evidence(
      binding,
      result.exitCode === 0 ? 'HEALTHY' : 'UNAVAILABLE',
      result.exitCode === 0,
      result.exitCode === 0 ? ['EPHEMERAL_INJECTION', 'LEASE_REVOKE'] : [],
    );
  }

  async inject(
    binding: SecretBindingV1,
    plan: SecretInjectionPlan,
    sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    assertBindingPlan(binding, plan);
    const reference = parseVaultReference(requireReference(binding));
    const result = await this.runner.run(
      'vault',
      ['read', '-format=json', reference.path],
      this.timeoutMs,
    );
    if (result.exitCode !== 0) throw new Error('HASHICORP_VAULT secret resolution failed');
    const material = parseVaultMaterial(result.stdout, reference.field);
    const receipt = await injectAndValidate(binding, plan, sink, material);
    if (material.resolverLeaseId) this.#leases.set(receipt.receiptId, material.resolverLeaseId);
    return receipt;
  }

  async revoke(receiptId: string, sink: SecretMaterialInjectionSink): Promise<void> {
    const leaseId = this.#leases.get(receiptId);
    if (leaseId) {
      const result = await this.runner.run('vault', ['lease', 'revoke', leaseId], this.timeoutMs);
      if (result.exitCode !== 0) throw new Error('HASHICORP_VAULT lease revocation failed');
      this.#leases.delete(receiptId);
    }
    await sink.revoke(receiptId);
  }
}

export class GitHubAuthCapabilityResolverAdapter implements SecretResolverRuntimeAdapter {
  readonly kind = 'GITHUB_AUTH_CAPABILITY' as const;

  constructor(
    readonly runner: SecretCommandRunner,
    readonly timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  ) {
    requireTimeout(timeoutMs);
  }

  async probe(binding: SecretBindingV1): Promise<SecretResolverEvidenceV1> {
    assertBindingKind(binding, this.kind);
    const result = await this.runner.run('gh', ['auth', 'status'], this.timeoutMs);
    return evidence(
      binding,
      result.exitCode === 0 ? 'HEALTHY' : 'UNAVAILABLE',
      result.exitCode === 0,
      result.exitCode === 0 ? ['GITHUB_AUTH'] : [],
    );
  }

  async inject(
    binding: SecretBindingV1,
    _plan: SecretInjectionPlan,
    _sink: SecretMaterialInjectionSink,
  ): Promise<SecretInjectionReceipt> {
    assertBindingKind(binding, this.kind);
    throw new Error('GITHUB_AUTH_CAPABILITY satisfies authentication by probe and cannot inject');
  }
}

export function secretResolverRuntimeCanExposeSecretValues(): false {
  return false;
}

export function secretResolverRuntimeCanPersistSecretValues(): false {
  return false;
}

export function secretResolverRuntimeUsesShell(): false {
  return false;
}

export function secretResolverRuntimeCanGrantAuthority(): false {
  return false;
}

function evidence(
  binding: SecretBindingV1,
  health: SecretResolverEvidenceV1['health'],
  authenticated: boolean | null,
  availableCapabilities: readonly string[],
): SecretResolverEvidenceV1 {
  return {
    resolverKind: binding.resolverKind,
    handleId: binding.handleId,
    health,
    authenticated,
    availableCapabilities: [...new Set(availableCapabilities)].sort(),
  };
}

async function injectAndValidate(
  binding: SecretBindingV1,
  plan: SecretInjectionPlan,
  sink: SecretMaterialInjectionSink,
  material: ResolvedSecretMaterial,
): Promise<SecretInjectionReceipt> {
  if (!material.value) throw new Error('secret resolver returned an empty value');
  const receipt = await sink.inject({
    plan,
    resolverKind: binding.resolverKind,
    value: material.value,
    ...(material.resolverLeaseExpiresAt
      ? { resolverLeaseExpiresAt: material.resolverLeaseExpiresAt }
      : {}),
  });
  const validation = validateSecretInjectionReceipt(plan, receipt);
  if (!validation.valid) {
    throw new Error('secret injection receipt is invalid: ' + validation.errors.join('; '));
  }
  return receipt;
}

function assertBindingPlan(binding: SecretBindingV1, plan: SecretInjectionPlan): void {
  assertBindingKind(binding, binding.resolverKind);
  if (binding.handleId !== plan.handleId) throw new Error('secret binding and injection plan mismatch');
  if (secretBackendForResolverKind(binding.resolverKind) !== plan.backend) {
    throw new Error('secret resolver backend does not match injection plan');
  }
  if (binding.storage === 'PROJECT_TEMPLATE') {
    throw new Error('PROJECT_TEMPLATE secret binding cannot resolve material');
  }
}

function assertBindingKind(binding: SecretBindingV1, kind: SecretResolverKind): void {
  validateSecretBindingV1(binding);
  if (binding.resolverKind !== kind) throw new Error('secret binding resolver kind mismatch');
}

function secretBackendForResolverKind(kind: SecretResolverKind): SecretBackendKind {
  if (kind === 'LOCAL_ENV') return 'LOCAL_ENV';
  if (kind === 'OS_KEYCHAIN') return 'OS_KEYCHAIN';
  return 'EXTERNAL_BROKER';
}

function requireReference(binding: SecretBindingV1): string {
  if (!binding.reference) throw new Error('secret binding resolver reference is required');
  return binding.reference;
}

function onePasswordCommand(reference: string) {
  if (!reference.startsWith('op://')) throw new Error('ONEPASSWORD reference must use op://');
  return {
    executable: 'op',
    probeArgs: ['--version'],
    readArgs: ['read', reference, '--no-newline'],
    parseValue: (stdout: string) => stdout.replace(/[\r\n]+$/, ''),
  };
}

function bitwardenCommand(reference: string) {
  if (!reference.startsWith('bw://')) throw new Error('BITWARDEN reference must use bw://');
  const id = reference.slice('bw://'.length);
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(id)) throw new Error('BITWARDEN reference id is invalid');
  return {
    executable: 'bws',
    probeArgs: ['--version'],
    readArgs: ['secret', 'get', id, '--output', 'json'],
    parseValue(stdout: string) {
      const parsed = parseJsonRecord(stdout, 'BITWARDEN');
      if (typeof parsed.value !== 'string') throw new Error('BITWARDEN response has no value');
      return parsed.value;
    },
  };
}

function osKeychainCommand(
  platform: NodeJS.Platform,
  reference: string,
):
  | {
      readonly executable: string;
      readonly probeArgs: readonly string[];
      readonly readArgs: readonly string[];
    }
  | null {
  const parsed = parseKeychainReference(reference);
  if (platform === 'darwin') {
    return {
      executable: 'security',
      probeArgs: ['help'],
      readArgs: [
        'find-generic-password',
        '-s',
        parsed.service,
        '-a',
        parsed.account,
        '-w',
      ],
    };
  }
  if (platform === 'linux') {
    return {
      executable: 'secret-tool',
      probeArgs: ['--version'],
      readArgs: ['lookup', 'service', parsed.service, 'account', parsed.account],
    };
  }
  return null;
}

function parseKeychainReference(reference: string): { service: string; account: string } {
  if (!reference.startsWith('keychain://')) {
    throw new Error('OS_KEYCHAIN reference must use keychain://service/account');
  }
  const raw = reference.slice('keychain://'.length);
  const separator = raw.indexOf('/');
  if (separator <= 0 || separator === raw.length - 1) {
    throw new Error('OS_KEYCHAIN reference must include service and account');
  }
  const service = raw.slice(0, separator);
  const account = raw.slice(separator + 1);
  requireSafeLocatorPart(service, 'keychain service');
  requireSafeLocatorPart(account, 'keychain account');
  return { service, account };
}

function parseVaultReference(reference: string): { path: string; field: string } {
  if (!reference.startsWith('vault://')) throw new Error('VAULT reference must use vault://');
  const raw = reference.slice('vault://'.length);
  const separator = raw.lastIndexOf('#');
  if (separator <= 0 || separator === raw.length - 1) {
    throw new Error('VAULT reference must include path#field');
  }
  const path = raw.slice(0, separator);
  const field = raw.slice(separator + 1);
  if (!/^[A-Za-z0-9._/-]{1,300}$/.test(path) || path.includes('..')) {
    throw new Error('VAULT path is invalid');
  }
  requireSafeLocatorPart(field, 'vault field');
  return { path, field };
}

function parseVaultMaterial(stdout: string, field: string): ResolvedSecretMaterial {
  const parsed = parseJsonRecord(stdout, 'HASHICORP_VAULT');
  const outerData = isRecord(parsed.data) ? parsed.data : null;
  const values = outerData && isRecord(outerData.data) ? outerData.data : outerData;
  if (!values || typeof values[field] !== 'string') {
    throw new Error('HASHICORP_VAULT response has no requested field');
  }

  const leaseId = typeof parsed.lease_id === 'string' && parsed.lease_id ? parsed.lease_id : undefined;
  const leaseDuration =
    typeof parsed.lease_duration === 'number' &&
    Number.isInteger(parsed.lease_duration) &&
    parsed.lease_duration > 0
      ? parsed.lease_duration
      : undefined;
  const leaseExpiresAt =
    leaseDuration === undefined
      ? undefined
      : new Date(Date.now() + leaseDuration * 1000).toISOString();

  return {
    value: values[field],
    ...(leaseId ? { resolverLeaseId: leaseId } : {}),
    ...(leaseExpiresAt ? { resolverLeaseExpiresAt: leaseExpiresAt } : {}),
  };
}

function parseJsonRecord(stdout: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(`${name} resolver returned malformed JSON`);
  }
  if (!isRecord(parsed)) throw new Error(`${name} resolver returned malformed JSON`);
  return parsed;
}

function requireSuccessfulSecretResult(result: SecretCommandResult, kind: string): string {
  if (result.exitCode !== 0) throw new Error(`${kind} secret resolution failed`);
  const value = result.stdout.replace(/[\r\n]+$/, '');
  if (!value) throw new Error(`${kind} secret resolution returned no value`);
  return value;
}

function requireSafeLocatorPart(value: string, field: string): void {
  if (!/^[A-Za-z0-9._:@/-]{1,160}$/.test(value) || value.includes('..')) {
    throw new Error(`${field} is invalid`);
  }
}

function requireExecutable(value: string): void {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error('secret resolver executable is invalid');
}

function requireArgument(value: string): void {
  if (value.length > 2048 || /[\r\n\0]/.test(value)) {
    throw new Error('secret resolver argument must be bounded single-line metadata');
  }
}

function requireTimeout(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 120_000) {
    throw new Error('secret resolver timeout must be a positive bounded integer');
  }
}

function exitCodeFromError(error: NodeJS.ErrnoException): number {
  const code = (error as NodeJS.ErrnoException & { code?: string | number }).code;
  return typeof code === 'number' ? code : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
