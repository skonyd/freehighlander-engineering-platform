#!/usr/bin/env node

import {
  bindLocalSecret,
  createLocalSecretProfileStore,
  defaultSecretRequirementsFile,
  doctorLocalSecrets,
  inspectLocalSecretProfile,
  loadSecretRequirements,
  optionalSecretCliOption,
  parseSecretCliArgs,
  readLocalSecretProfile,
  requireSecretCliOption,
  unbindLocalSecret,
  writeLocalSecretProfile,
} from './lib/secrets.mjs';
import { findRepoRoot } from './lib/state.mjs';

const root = await findRepoRoot();
const parsed = parseSecretCliArgs(process.argv.slice(2));
const profileId = optionalSecretCliOption(parsed.options, 'profile') ?? 'default';
const store = createLocalSecretProfileStore(root, profileId);
const current = readLocalSecretProfile(store, profileId);

try {
  switch (parsed.command) {
    case 'status':
      printJson({
        generation: current.generation,
        snapshotHash: current.snapshotHash,
        ...(await inspectLocalSecretProfile(current.profile)),
      });
      break;

    case 'bind':
      await bindCommand();
      break;

    case 'unbind':
      await unbindCommand();
      break;

    case 'doctor':
      await doctorCommand();
      break;

    case 'help':
    case undefined:
      printHelp();
      break;

    default:
      throw new Error(`unknown secrets command: ${parsed.command}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FreeHighlander secrets FAIL: ${message}`);
  process.exitCode = 1;
}

async function bindCommand() {
  const handleId = requireSecretCliOption(parsed.options, 'handle');
  const resolverKind = requireSecretCliOption(parsed.options, 'resolver');
  const reference = optionalSecretCliOption(parsed.options, 'reference') ?? null;
  const storage = optionalSecretCliOption(parsed.options, 'storage') ?? 'MACHINE_LOCAL';
  const accountProfile = optionalSecretCliOption(parsed.options, 'account-profile') ?? null;
  const portableReferenceApproved = parsed.options['portable-reference-approved'] === true;

  const profile = bindLocalSecret(current.profile, {
    profileId,
    handleId,
    resolverKind,
    storage,
    reference,
    accountProfile,
    portableReferenceApproved,
  });
  const written = writeLocalSecretProfile(store, current.generation, profile);

  printJson({
    action: 'secret.bind',
    profileId,
    handleId,
    resolverKind,
    storage,
    referenceConfigured: reference !== null,
    generation: written.generation,
    snapshotHash: written.snapshotHash,
    authority: 'NONE',
    secretValuesPresent: false,
  });
}

async function unbindCommand() {
  const handleId = requireSecretCliOption(parsed.options, 'handle');
  const profile = unbindLocalSecret(current.profile, handleId);
  const written = writeLocalSecretProfile(store, current.generation, profile);

  printJson({
    action: 'secret.unbind',
    profileId,
    handleId,
    generation: written.generation,
    snapshotHash: written.snapshotHash,
    authority: 'NONE',
    secretValuesPresent: false,
  });
}

async function doctorCommand() {
  const requirementsFile =
    optionalSecretCliOption(parsed.options, 'requirements') ??
    defaultSecretRequirementsFile(root);
  const requirements = await loadSecretRequirements(requirementsFile);
  const result = await doctorLocalSecrets(current.profile, requirements);
  printJson({
    requirementsFile,
    generation: current.generation,
    snapshotHash: current.snapshotHash,
    ...result,
  });
  if (result.status === 'BLOCKED_CONFIGURATION') process.exitCode = 2;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`FreeHighlander portable secret bindings

Usage:
  npm run secrets -- status [--profile <name>]
  npm run secrets -- bind --profile <name> --handle <logical-handle> \\
    --resolver LOCAL_ENV|OS_KEYCHAIN|ONEPASSWORD|BITWARDEN_SECRETS_MANAGER|HASHICORP_VAULT|GITHUB_AUTH_CAPABILITY|EXTERNAL_BROKER \\
    [--reference <locator>] [--storage MACHINE_LOCAL|PORTABLE_REFERENCE|PROJECT_TEMPLATE] \\
    [--account-profile <name>] [--portable-reference-approved]
  npm run secrets -- unbind --profile <name> --handle <logical-handle>
  npm run secrets -- doctor [--profile <name>] [--requirements <file>]

Defaults:
  profile=default
  requirements=.freehighlander/secret-requirements.json
  local profile files=.freehighlander/runtime/secret-bindings/<profile>.json

Safety:
  - local binding profiles are under the gitignored runtime directory
  - secret values are never accepted as CLI arguments
  - status/doctor never print resolved values or private locators
  - resolver references are identifiers/locators only and remain machine-local by default
`);
}
