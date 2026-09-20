const ALLOWED_REGISTRY_PREFIX = 'https://registry.npmjs.org/';

export function analyzeLockfileProvenance(lockfile, packageJson) {
  const errors = [];

  if (!lockfile || typeof lockfile !== 'object') {
    return { valid: false, errors: ['package-lock.json must be an object'], externalPackageCount: 0 };
  }

  if (lockfile.lockfileVersion !== 3) {
    errors.push('package-lock.json must use lockfileVersion 3');
  }

  validateManifestDependencySpecs(packageJson?.dependencies, 'dependencies', errors);
  validateManifestDependencySpecs(packageJson?.devDependencies, 'devDependencies', errors);
  validateManifestDependencySpecs(packageJson?.optionalDependencies, 'optionalDependencies', errors);

  let externalPackageCount = 0;

  for (const [entryPath, metadata] of Object.entries(lockfile.packages ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (entryPath === '') continue;
    if (!entryPath.startsWith('node_modules/')) continue;
    if (metadata?.link === true) continue;

    externalPackageCount += 1;

    if (metadata?.hasInstallScript === true) {
      errors.push(`${entryPath} must not declare install scripts`);
    }

    if (typeof metadata?.resolved !== 'string') {
      errors.push(`${entryPath} must declare resolved package provenance`);
    } else if (!metadata.resolved.startsWith(ALLOWED_REGISTRY_PREFIX)) {
      errors.push(`${entryPath} must resolve from registry.npmjs.org over HTTPS`);
    }

    if (typeof metadata?.integrity !== 'string' || !metadata.integrity.startsWith('sha512-')) {
      errors.push(`${entryPath} must declare sha512 integrity metadata`);
    }
  }

  if (externalPackageCount === 0) {
    errors.push('lockfile must contain at least one external package for provenance validation');
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    externalPackageCount,
  };
}

function validateManifestDependencySpecs(dependencies, field, errors) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return;

  for (const [name, spec] of Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof spec !== 'string') {
      errors.push(`${field} ${name} must use a string dependency specifier`);
      continue;
    }

    const normalized = spec.trim().toLowerCase();
    if (
      normalized.startsWith('git+') ||
      normalized.startsWith('git://') ||
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('file:') ||
      normalized.startsWith('github:') ||
      normalized.startsWith('gitlab:') ||
      normalized.startsWith('bitbucket:')
    ) {
      errors.push(`${field} ${name} must not use remote/git/file dependency specifier ${spec}`);
    }
  }
}
