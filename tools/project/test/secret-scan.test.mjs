import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSecretFindings,
  scanTextForSecrets,
  trackedEnvFileViolation,
} from '../lib/secret-scan.mjs';

test('benign security documentation and redaction placeholders are accepted', () => {
  const text = [
    'Bearer [REDACTED]',
    'apiKey: [REDACTED]',
    'example token: not-a-real-token',
    'private key material must never be committed',
  ].join('\n');

  assert.deepEqual(scanTextForSecrets(text, 'docs/example.md'), []);
});

test('private-key PEM material is rejected with line evidence', () => {
  const marker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const findings = scanTextForSecrets(`safe\n${marker}\nbody`, 'secret.pem');

  assert.deepEqual(findings, [{ file: 'secret.pem', kind: 'PRIVATE_KEY_PEM', line: 2 }]);
});

test('high-confidence credential formats are rejected without embedding real credentials', () => {
  const samples = [
    ['AWS_ACCESS_KEY_ID', 'AKIA' + 'A'.repeat(16)],
    ['GITHUB_TOKEN', 'ghp_' + 'A'.repeat(40)],
    ['GITHUB_FINE_GRAINED_PAT', 'github_pat_' + 'A'.repeat(82)],
    ['OPENAI_API_KEY', 'sk-' + 'A'.repeat(48)],
    ['SLACK_TOKEN', 'xoxb-' + 'A'.repeat(24)],
  ];

  for (const [kind, sample] of samples) {
    const findings = scanTextForSecrets(sample, 'fixture.txt');
    assert.equal(findings.length, 1, kind);
    assert.equal(findings[0].kind, kind);
  }
});

test('tracked env files fail closed except explicit examples', () => {
  assert.equal(trackedEnvFileViolation('.env.example'), null);
  assert.equal(trackedEnvFileViolation('config/.env.sample'), null);
  assert.equal(trackedEnvFileViolation('config/.env.template'), null);

  assert.deepEqual(trackedEnvFileViolation('.env'), {
    file: '.env',
    kind: 'TRACKED_ENV_FILE',
    line: 1,
  });
  assert.deepEqual(trackedEnvFileViolation('config/.env.production'), {
    file: 'config/.env.production',
    kind: 'TRACKED_ENV_FILE',
    line: 1,
  });
});

test('finding formatting never emits matched secret material', () => {
  const sample = 'ghp_' + 'B'.repeat(40);
  const findings = scanTextForSecrets(sample, 'fixture.txt');
  const formatted = formatSecretFindings(findings);

  assert.equal(formatted.length, 1);
  assert.equal(formatted[0].includes(sample), false);
  assert.equal(formatted[0], 'fixture.txt:1 GITHUB_TOKEN');
});
