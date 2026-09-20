const FORBIDDEN_LIFECYCLE_SCRIPTS = [
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
  'prepack',
  'postpack',
  'prepare',
  'preinstall',
  'install',
  'postinstall',
];

export function analyzePublishSafety(rootManifest, workspaces) {
  const errors = [];

  if (rootManifest?.private !== true) {
    errors.push('root package must remain private=true');
  }
  if (rootManifest?.version !== '0.0.0') {
    errors.push('root package version must remain 0.0.0 while pre-release');
  }
  if (rootManifest?.publishConfig !== undefined) {
    errors.push('root package must not declare publishConfig');
  }
  validateScripts('root package', rootManifest?.scripts, errors);

  for (const workspace of [...workspaces].sort((a, b) =>
    a.relativeDirectory.localeCompare(b.relativeDirectory),
  )) {
    const label = workspace.name ?? workspace.relativeDirectory;
    const manifest = workspace.manifest ?? {};

    if (manifest.private !== true) {
      errors.push(`${label} must remain private=true`);
    }
    if (manifest.version !== '0.0.0') {
      errors.push(`${label} version must remain 0.0.0 while pre-release`);
    }
    if (manifest.publishConfig !== undefined) {
      errors.push(`${label} must not declare publishConfig`);
    }
    if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@freehighlander/')) {
      errors.push(`${workspace.relativeDirectory} must use the @freehighlander/ package scope`);
    }

    validateScripts(label, manifest.scripts, errors);
  }

  if (workspaces.length === 0) {
    errors.push('publish-safety check must discover at least one workspace');
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    workspaceCount: workspaces.length,
  };
}

function validateScripts(label, scripts, errors) {
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return;

  for (const scriptName of FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (Object.hasOwn(scripts, scriptName)) {
      errors.push(`${label} must not declare lifecycle script ${scriptName}`);
    }
  }

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') continue;
    if (/\bnpm\s+(?:publish|pack)\b/i.test(command)) {
      errors.push(`${label} script ${scriptName} must not invoke npm publish/pack`);
    }
  }
}
