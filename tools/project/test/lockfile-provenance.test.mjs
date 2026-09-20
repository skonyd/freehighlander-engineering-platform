import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeLockfileProvenance } from '../lib/lockfile-provenance.mjs';

function validFixture() {
  return {
    packageJson: {
      dependencies: { yaml: '2.9.1' },
      devDependencies: { prettier: '3.9.8' },
    },
    lockfile: {
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { yaml: '2.9.1' },
          devDependencies: { prettier: '3.9.8' },
        },
        'node_modules/yaml': {
          version: '2.9.1',
          resolved: 'https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz',
          integrity: 'sha512-' + 'A'.repeat(64),
        },
        'node_modules/prettier': {
          version: '3.9.8',
          resolved: 'https://registry.npmjs.org/prettier/-/prettier-3.9.8.tgz',
          integrity: 'sha512-' + 'B'.repeat(64),
          dev: true,
        },
      },
    },
  };
}

test('registry HTTPS + sha512 + no install scripts passes', () => {
  const { packageJson, lockfile } = validFixture();
  assert.deepEqual(analyzeLockfileProvenance(lockfile, packageJson), {
    valid: true,
    errors: [],
    externalPackageCount: 2,
  });
});

test('workspace links are exempt from external provenance checks', () => {
  const { packageJson, lockfile } = validFixture();
  lockfile.packages['node_modules/@freehighlander/governance'] = {
    resolved: 'packages/governance',
    link: true,
  };

  assert.equal(analyzeLockfileProvenance(lockfile, packageJson).valid, true);
});

test('non-registry, missing-integrity and install-script packages fail closed', () => {
  const { packageJson, lockfile } = validFixture();
  lockfile.packages['node_modules/yaml'] = {
    version: '2.9.1',
    resolved: 'https://example.invalid/yaml.tgz',
    hasInstallScript: true,
  };

  const result = analyzeLockfileProvenance(lockfile, packageJson);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /registry\.npmjs\.org/);
  assert.match(result.errors.join('\n'), /sha512 integrity/);
  assert.match(result.errors.join('\n'), /install scripts/);
});

test('git file and URL manifest dependency specs fail closed', () => {
  const forbidden = [
    'git+https://github.com/example/repo.git',
    'git://github.com/example/repo.git',
    'http://example.invalid/package.tgz',
    'https://example.invalid/package.tgz',
    'file:../package',
    'github:example/repo',
  ];

  for (const spec of forbidden) {
    const { packageJson, lockfile } = validFixture();
    packageJson.dependencies.yaml = spec;
    const result = analyzeLockfileProvenance(lockfile, packageJson);
    assert.equal(result.valid, false, spec);
    assert.match(result.errors.join('\n'), /must not use remote\/git\/file dependency specifier/);
  }
});

test('malformed or empty external lockfiles fail closed', () => {
  assert.equal(analyzeLockfileProvenance(null, {}).valid, false);
  assert.equal(
    analyzeLockfileProvenance({ lockfileVersion: 3, packages: { '': {} } }, {}).valid,
    false,
  );
});

test('lockfile version and missing resolved metadata fail closed', () => {
  const { packageJson, lockfile } = validFixture();
  lockfile.lockfileVersion = 2;
  delete lockfile.packages['node_modules/prettier'].resolved;

  const result = analyzeLockfileProvenance(lockfile, packageJson);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /lockfileVersion 3/);
  assert.match(result.errors.join('\n'), /resolved package provenance/);
});
