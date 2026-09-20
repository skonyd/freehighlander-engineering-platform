import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_TRACKED_FILE_BYTES = 2 * 1024 * 1024;

const SECRET_PATTERNS = [
  {
    kind: 'PRIVATE_KEY_PEM',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    kind: 'AWS_ACCESS_KEY_ID',
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    kind: 'GITHUB_TOKEN',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
  },
  {
    kind: 'GITHUB_FINE_GRAINED_PAT',
    regex: /\bgithub_pat_[A-Za-z0-9_]{80,255}\b/g,
  },
  {
    kind: 'OPENAI_API_KEY',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,255}\b/g,
  },
  {
    kind: 'SLACK_TOKEN',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/g,
  },
];

const ALLOWED_ENV_FILES = new Set(['.env.example', '.env.sample', '.env.template']);

export function scanTextForSecrets(text, file = '<memory>') {
  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      findings.push({
        file,
        kind: pattern.kind,
        line: lineNumberAt(text, index),
      });
    }
  }

  return findings.sort(compareFindings);
}

export function trackedEnvFileViolation(file) {
  const name = path.posix.basename(file.replaceAll('\\', '/'));
  if (ALLOWED_ENV_FILES.has(name)) return null;
  if (name === '.env' || name.startsWith('.env.')) {
    return {
      file,
      kind: 'TRACKED_ENV_FILE',
      line: 1,
    };
  }
  return null;
}

export async function scanTrackedRepository(root, options = {}) {
  const runGit = options.runGit ?? defaultRunGit(root);
  const tracked = parseTrackedFiles(runGit(['ls-files', '-z']));
  const findings = [];

  for (const file of tracked) {
    const envFinding = trackedEnvFileViolation(file);
    if (envFinding) findings.push(envFinding);

    const absolute = path.join(root, file);
    const stat = await fs.lstat(absolute);

    if (stat.isSymbolicLink() || !stat.isFile()) continue;

    if (stat.size > MAX_TRACKED_FILE_BYTES) {
      findings.push({
        file,
        kind: 'OVERSIZED_TRACKED_FILE_REQUIRES_REVIEW',
        line: 1,
      });
      continue;
    }

    const buffer = await fs.readFile(absolute);
    if (buffer.includes(0)) continue;

    findings.push(...scanTextForSecrets(buffer.toString('utf8'), file));
  }

  return findings.sort(compareFindings);
}

export function formatSecretFindings(findings) {
  return findings.map((finding) => `${finding.file}:${finding.line} ${finding.kind}`);
}

function parseTrackedFiles(output) {
  if (!output) return [];
  return output
    .split('\0')
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
}

function defaultRunGit(root) {
  return (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function compareFindings(left, right) {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.kind.localeCompare(right.kind)
  );
}
