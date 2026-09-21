import fs from 'node:fs/promises';
import path from 'node:path';

export async function analyzeBuildCompleteness(root, workspaces, baseConfig) {
  const errors = [];
  let sourceModuleCount = 0;
  let buildWorkspaceCount = 0;

  if (baseConfig?.compilerOptions?.declaration !== true) {
    errors.push('base tsconfig must keep declaration=true');
  }
  if (baseConfig?.compilerOptions?.sourceMap !== true) {
    errors.push('base tsconfig must keep sourceMap=true');
  }

  for (const workspace of workspaces) {
    if (typeof workspace.manifest?.scripts?.build !== 'string') continue;
    buildWorkspaceCount += 1;

    const configPath = path.join(workspace.directory, 'tsconfig.json');
    let config;
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch (error) {
      errors.push(
        `${workspace.name}: unable to read tsconfig.json: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (config?.compilerOptions?.rootDir !== 'src') {
      errors.push(`${workspace.name}: tsconfig rootDir must remain src`);
    }
    if (config?.compilerOptions?.outDir !== 'dist') {
      errors.push(`${workspace.name}: tsconfig outDir must remain dist`);
    }
    if (!Array.isArray(config.include) || !config.include.includes('src/**/*.ts')) {
      errors.push(`${workspace.name}: tsconfig include must contain src/**/*.ts`);
    }

    const srcRoot = path.join(workspace.directory, 'src');
    const sourceFiles = await listSourceModules(srcRoot);
    if (sourceFiles.length === 0) {
      errors.push(`${workspace.name}: build workspace must contain at least one src/**/*.ts module`);
      continue;
    }

    sourceModuleCount += sourceFiles.length;

    for (const source of sourceFiles) {
      const relative = path.relative(srcRoot, source);
      const stem = relative.slice(0, -'.ts'.length);
      for (const suffix of ['.js', '.d.ts', '.js.map']) {
        const expected = path.join(workspace.directory, 'dist', `${stem}${suffix}`);
        let stat;
        try {
          stat = await fs.lstat(expected);
        } catch (error) {
          if (error?.code === 'ENOENT') {
            errors.push(
              `${workspace.name}: missing build artifact for ${normalize(relative)}: dist/${normalize(stem)}${suffix}`,
            );
            continue;
          }
          throw error;
        }

        if (!stat.isFile() || stat.isSymbolicLink()) {
          errors.push(
            `${workspace.name}: build artifact must be a real file: dist/${normalize(stem)}${suffix}`,
          );
        }
      }
    }
  }

  if (buildWorkspaceCount === 0) {
    errors.push('no build workspaces discovered');
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    workspaceCount: buildWorkspaceCount,
    sourceModuleCount,
  };
}

async function listSourceModules(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceModules(absolute)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(absolute);
    }
  }

  return files.sort();
}

function normalize(value) {
  return value.replaceAll(path.sep, '/');
}
