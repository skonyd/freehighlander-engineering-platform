import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExecFileSecretCommandRunner,
  createDefaultSecretResolverRegistry,
  createSecretBindingProfileV1,
  createSecretBindingV1,
  createSecretRequirementV1,
  evaluateSecretBindingStatusV1,
  secretResolverRuntimeCanExposeSecretValues,
  secretResolverRuntimeCanGrantAuthority,
  secretResolverRuntimeCanPersistSecretValues,
  secretResolverRuntimeUsesShell,
} from '../dist/index.js';

class FakeRunner {
  calls = [];

  async run(executable, args, timeoutMs) {
    this.calls.push({ executable, args: [...args], timeoutMs });
    const key = [executable, ...args].join(' ');

    if (key === 'op --version') return { exitCode: 0, stdout: '2.31.0\n' };
    if (key.startsWith('op read op://')) return { exitCode: 0, stdout: 'op-material\n' };

    if (key === 'bws --version') return { exitCode: 0, stdout: '1.0.0\n' };
    if (key.startsWith('bws secret get ')) {
      return { exitCode: 0, stdout: JSON.stringify({ value: 'bw-material' }) };
    }

    if (key === 'vault status -format=json') return { exitCode: 0, stdout: '{}' };
    if (key.startsWith('vault read -format=json ')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          lease_id: 'lease-123',
          lease_duration: 60,
          data: { token: 'vault-material' },
        }),
      };
    }
    if (key === 'vault lease revoke lease-123') return { exitCode: 0, stdout: '' };

    if (key === 'gh auth status') return { exitCode: 0, stdout: 'authenticated' };

    if (key === 'security help') return { exitCode: 0, stdout: '' };
    if (key.startsWith('security find-generic-password ')) {
      return { exitCode: 0, stdout: 'keychain-material\n' };
    }

    if (key === 'secret-tool --version') return { exitCode: 0, stdout: '0.21\n' };
    if (key.startsWith('secret-tool lookup ')) {
      return { exitCode: 0, stdout: 'secret-service-material\n' };
    }

    if (executable === 'powershell.exe') {
      const script = args.at(-1) ?? '';
      if (!script.includes('Windows.Security.Credentials.PasswordVault')) {
        return { exitCode: 1, stdout: '' };
      }
      if (script.includes('$vault.Retrieve(')) {
        return { exitCode: 0, stdout: 'windows-keychain-material' };
      }
      return { exitCode: 0, stdout: '' };
    }

    return { exitCode: 1, stdout: '' };
  }
}

class CaptureSink {
  values = new Map();
  revoked = [];
  counter = 0;

  async inject(request) {
    this.counter += 1;
    const receiptId = `receipt-${this.counter}`;
    this.values.set(receiptId, request.value);
    const injectedAt = '2026-09-24T21:00:00.000Z';
    const expiresAt = new Date(Date.parse(injectedAt) + request.plan.ttlMs).toISOString();
    return {
      receiptId,
      handleId: request.plan.handleId,
      target: request.plan.target,
      injectedAt,
      expiresAt,
      valuePersisted: false,
      authority: 'NONE',
    };
  }

  async revoke(receiptId) {
    this.values.delete(receiptId);
    this.revoked.push(receiptId);
  }
}

function binding(handleId, resolverKind, reference) {
  return createSecretBindingV1({
    profileId: 'work-laptop',
    handleId,
    resolverKind,
    storage: 'MACHINE_LOCAL',
    reference,
    accountProfile: null,
    portableReferenceApproved: false,
  });
}

function requirement(handleId) {
  return createSecretRequirementV1({
    handleId,
    purpose: 'provider authentication',
    allowedTargets: ['PROVIDER_AUTH'],
    requiredCapabilities: ['EPHEMERAL_INJECTION'],
    requiredForRoles: ['controller'],
    optional: false,
  });
}

function plan(handleId, backend = 'EXTERNAL_BROKER') {
  return {
    handleId,
    backend,
    target: 'PROVIDER_AUTH',
    logicalRole: 'controller',
    envName: null,
    ttlMs: 60_000,
    retentionClass: 'EPHEMERAL',
    persistValue: false,
    remoteModelEgress: false,
    redactLogs: true,
    authority: 'NONE',
  };
}

test('handle-specific resolver evidence prevents same-kind false READY state', async () => {
  const first = binding('provider.alpha.api', 'LOCAL_ENV', 'ALPHA_API_KEY');
  const second = binding('provider.beta.api', 'LOCAL_ENV', 'BETA_API_KEY');
  const profile = createSecretBindingProfileV1('work-laptop', [first, second]);
  const registry = createDefaultSecretResolverRegistry({
    environment: { ALPHA_API_KEY: 'present' },
    commandRunner: new FakeRunner(),
    platform: 'linux',
  });

  const evidence = await registry.probeAll(profile.bindings);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].handleId, 'provider.alpha.api');
  assert.equal(evidence[1].handleId, 'provider.beta.api');

  const status = evaluateSecretBindingStatusV1(
    [requirement('provider.alpha.api'), requirement('provider.beta.api')],
    profile,
    evidence,
  );
  assert.equal(status.status, 'BLOCKED_CONFIGURATION');
  assert.equal(status.resolutions[0].status, 'RESOLVABLE');
  assert.equal(status.resolutions[1].status, 'BLOCKED_CONFIGURATION');
});

test('LOCAL_ENV resolves only into an ephemeral sink and receipt contains no value', async () => {
  const secretBinding = binding('provider.openai.api', 'LOCAL_ENV', 'OPENAI_API_KEY');
  const registry = createDefaultSecretResolverRegistry({
    environment: { OPENAI_API_KEY: 'runtime-only-material' },
    commandRunner: new FakeRunner(),
    platform: 'linux',
  });
  const sink = new CaptureSink();

  const receipt = await registry.inject(
    secretBinding,
    plan('provider.openai.api', 'LOCAL_ENV'),
    sink,
  );

  assert.equal(sink.values.get(receipt.receiptId), 'runtime-only-material');
  assert.equal(receipt.valuePersisted, false);
  assert.doesNotMatch(JSON.stringify(receipt), /runtime-only-material/);

  await registry.revoke(secretBinding, receipt.receiptId, sink);
  assert.equal(sink.values.has(receipt.receiptId), false);
});

test('OS_KEYCHAIN uses native command adapters and fails closed without a secure backend', async () => {
  const secretBinding = binding('provider.keychain.api', 'OS_KEYCHAIN', 'keychain://fh/openai');
  const sink = new CaptureSink();

  const macRunner = new FakeRunner();
  const macRegistry = createDefaultSecretResolverRegistry({
    platform: 'darwin',
    commandRunner: macRunner,
  });
  const macReceipt = await macRegistry.inject(
    secretBinding,
    plan('provider.keychain.api', 'OS_KEYCHAIN'),
    sink,
  );
  assert.equal(sink.values.get(macReceipt.receiptId), 'keychain-material');
  assert.deepEqual(macRunner.calls.at(-1).args, [
    'find-generic-password',
    '-s',
    'fh',
    '-a',
    'openai',
    '-w',
  ]);

  const linuxRunner = new FakeRunner();
  const linuxRegistry = createDefaultSecretResolverRegistry({
    platform: 'linux',
    commandRunner: linuxRunner,
  });
  const linuxReceipt = await linuxRegistry.inject(
    secretBinding,
    plan('provider.keychain.api', 'OS_KEYCHAIN'),
    sink,
  );
  assert.equal(sink.values.get(linuxReceipt.receiptId), 'secret-service-material');

  const windowsRunner = new FakeRunner();
  const windowsRegistry = createDefaultSecretResolverRegistry({
    platform: 'win32',
    commandRunner: windowsRunner,
  });
  const evidence = await windowsRegistry.probe(secretBinding);
  assert.equal(evidence.health, 'HEALTHY');
  assert.equal(evidence.authenticated, true);
  const windowsReceipt = await windowsRegistry.inject(
    secretBinding,
    plan('provider.keychain.api', 'OS_KEYCHAIN'),
    sink,
  );
  assert.equal(sink.values.get(windowsReceipt.receiptId), 'windows-keychain-material');
  const windowsCall = windowsRunner.calls.at(-1);
  assert.equal(windowsCall.executable, 'powershell.exe');
  assert.deepEqual(windowsCall.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.match(windowsCall.args.at(-1), /\.Retrieve\('fh','openai'\)/);
  assert.doesNotMatch(JSON.stringify(windowsCall.args), /windows-keychain-material/);

  const unsafeBinding = binding(
    'provider.unsafe-keychain.api',
    'OS_KEYCHAIN',
    'keychain://fh/openai;Write-Output',
  );
  await assert.rejects(
    () =>
      windowsRegistry.inject(
        unsafeBinding,
        plan('provider.unsafe-keychain.api', 'OS_KEYCHAIN'),
        sink,
      ),
    /keychain account is invalid/,
  );

  const unsupportedRegistry = createDefaultSecretResolverRegistry({
    platform: 'aix',
    commandRunner: new FakeRunner(),
  });
  const unsupported = await unsupportedRegistry.probe(secretBinding);
  assert.equal(unsupported.health, 'UNAVAILABLE');
  await assert.rejects(
    () =>
      unsupportedRegistry.inject(secretBinding, plan('provider.keychain.api', 'OS_KEYCHAIN'), sink),
    /secure OS keychain backend is unavailable/,
  );
});

test('Windows OS_KEYCHAIN fails closed when Credential Locker activation is unavailable', async () => {
  const secretBinding = binding(
    'provider.windows-keychain.api',
    'OS_KEYCHAIN',
    'keychain://freehighlander/openai',
  );
  const runner = {
    calls: [],
    async run(executable, args, timeoutMs) {
      this.calls.push({ executable, args: [...args], timeoutMs });
      return { exitCode: 1, stdout: '' };
    },
  };
  const registry = createDefaultSecretResolverRegistry({
    platform: 'win32',
    commandRunner: runner,
  });
  const sink = new CaptureSink();

  const evidence = await registry.probe(secretBinding);
  assert.equal(evidence.health, 'UNAVAILABLE');
  assert.equal(evidence.authenticated, false);
  assert.deepEqual(evidence.availableCapabilities, []);

  await assert.rejects(
    () =>
      registry.inject(secretBinding, plan('provider.windows-keychain.api', 'OS_KEYCHAIN'), sink),
    /OS_KEYCHAIN secret resolution failed/,
  );
  assert.equal(sink.values.size, 0);
  assert.ok(runner.calls.every((call) => call.executable === 'powershell.exe'));
});

test('1Password and Bitwarden adapters inject fixture values without exposing them in receipts', async () => {
  const runner = new FakeRunner();
  const registry = createDefaultSecretResolverRegistry({
    commandRunner: runner,
    platform: 'linux',
  });
  const sink = new CaptureSink();

  const opBinding = binding(
    'provider.anthropic.api',
    'ONEPASSWORD',
    'op://engineering/anthropic/token',
  );
  const opReceipt = await registry.inject(opBinding, plan('provider.anthropic.api'), sink);
  assert.equal(sink.values.get(opReceipt.receiptId), 'op-material');
  assert.doesNotMatch(JSON.stringify(opReceipt), /op-material/);

  const bwBinding = binding('provider.gemini.api', 'BITWARDEN_SECRETS_MANAGER', 'bw://secret-123');
  const bwReceipt = await registry.inject(bwBinding, plan('provider.gemini.api'), sink);
  assert.equal(sink.values.get(bwReceipt.receiptId), 'bw-material');
  assert.doesNotMatch(JSON.stringify(bwReceipt), /bw-material/);
});

test('Vault adapter tracks dynamic lease only in memory and revokes it before sink cleanup', async () => {
  const runner = new FakeRunner();
  const registry = createDefaultSecretResolverRegistry({
    commandRunner: runner,
    platform: 'linux',
  });
  const sink = new CaptureSink();
  const vaultBinding = binding(
    'provider.vault.api',
    'HASHICORP_VAULT',
    'vault://secret/data/freehighlander#token',
  );

  const receipt = await registry.inject(vaultBinding, plan('provider.vault.api'), sink);
  assert.equal(sink.values.get(receipt.receiptId), 'vault-material');
  assert.doesNotMatch(JSON.stringify(receipt), /vault-material|lease-123/);

  await registry.revoke(vaultBinding, receipt.receiptId, sink);
  assert.equal(sink.values.has(receipt.receiptId), false);
  assert.ok(
    runner.calls.some(
      (call) => call.executable === 'vault' && call.args.join(' ') === 'lease revoke lease-123',
    ),
  );
});

test('GitHub auth capability is probed without credential extraction or injection', async () => {
  const runner = new FakeRunner();
  const registry = createDefaultSecretResolverRegistry({
    commandRunner: runner,
    platform: 'linux',
  });
  const githubBinding = binding(
    'github.repo.auth',
    'GITHUB_AUTH_CAPABILITY',
    'github-auth://current-user',
  );

  const evidence = await registry.probe(githubBinding);
  assert.equal(evidence.health, 'HEALTHY');
  assert.equal(evidence.authenticated, true);
  assert.deepEqual(evidence.availableCapabilities, ['GITHUB_AUTH']);

  await assert.rejects(
    () => registry.inject(githubBinding, plan('github.repo.auth'), new CaptureSink()),
    /cannot inject/,
  );
});

test('resolver runtime invariants remain authority-neutral shell-free and non-persistent', () => {
  assert.equal(secretResolverRuntimeCanExposeSecretValues(), false);
  assert.equal(secretResolverRuntimeCanPersistSecretValues(), false);
  assert.equal(secretResolverRuntimeUsesShell(), false);
  assert.equal(secretResolverRuntimeCanGrantAuthority(), false);
});

test('execFile secret command runner is shell-free and normalizes process failure without output leakage', async () => {
  const runner = new ExecFileSecretCommandRunner();
  const success = await runner.run('node', ['-e', "process.stdout.write('ok')"], 5_000);
  assert.deepEqual(success, { exitCode: 0, stdout: 'ok' });

  const missing = await runner.run('fh-secret-command-that-does-not-exist', [], 5_000);
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.stdout, '');

  await assert.rejects(
    () => runner.run('../bad', [], 5_000),
    /secret resolver executable is invalid/,
  );
});
