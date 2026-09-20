import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import {
  buildRetentionPlan,
  evaluateProviderEgress,
  evaluateSandboxPermission,
  parseDataPolicyYaml,
  parseSandboxPolicyYaml,
  redactSensitive,
  validateDataPolicy,
  validateRetentionRecords,
} from '@freehighlander/governance';
import {
  inspectSqliteTelemetryFile,
  restoreSqliteTelemetryBackupToNewFile,
  SqliteTelemetryStore,
} from '@freehighlander/persistence';
import { createHardeningEvent } from '@freehighlander/telemetry';
import { traverseLineage, validateLineageGraph } from '@freehighlander/lineage';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataPolicy = parseDataPolicyYaml(
  readFileSync(path.join(root, '.freehighlander', 'data-policy.yaml'), 'utf8'),
);
const sandboxPolicy = parseSandboxPolicyYaml(
  readFileSync(path.join(root, '.freehighlander', 'sandbox-policy.yaml'), 'utf8'),
);

const repository = 'skonyd/freehighlander-engineering-platform';
const revision = 'a'.repeat(40);
const digest = (value) => value.repeat(64);

test('SECRET remote egress stays denied across all approval permutations', () => {
  for (const policyApproved of [false, true]) {
    for (const providerBindingApproved of [false, true]) {
      const decision = evaluateProviderEgress(dataPolicy, {
        classification: 'SECRET',
        remote: true,
        policyApproved,
        providerBindingApproved,
      });

      assert.equal(decision.allowed, false);
      assert.equal(decision.authority, 'NONE');
    }
  }
});

test('accepted data-policy invariants reject deterministic weakening mutations', () => {
  const mutations = [
    (policy) => {
      policy.provider_egress.SECRET.remote_allowed = true;
    },
    (policy) => {
      policy.persistence.redact_before_store = false;
    },
    (policy) => {
      policy.persistence.raw_prompt_response_default = true;
    },
    (policy) => {
      policy.rules.secret_in_project_state = 'allow';
    },
    (policy) => {
      policy.rules.confidential_remote_egress_requires_policy = false;
    },
  ];

  for (const mutate of mutations) {
    const weakened = structuredClone(dataPolicy);
    mutate(weakened);
    assert.equal(validateDataPolicy(weakened).valid, false);
  }
});

test('redaction survives nested arrays, secret-like keys and inline bearer material', () => {
  const sanitized = redactSensitive({
    safe: 'visible',
    nested: [
      { apiKey: 'secret-value' },
      { clientSecret: 'secret-value-2' },
      { authorization: 'Bearer should-not-survive' },
      { message: 'Bearer abc.def.ghi' },
    ],
  });

  assert.deepEqual(sanitized, {
    safe: 'visible',
    nested: [
      { apiKey: '[REDACTED]' },
      { clientSecret: '[REDACTED]' },
      { authorization: '[REDACTED]' },
      { message: 'Bearer [REDACTED]' },
    ],
  });
});

test('sandbox escape and privilege-expansion mutation matrix fails closed', () => {
  const base = {
    repositoryRoot: '/workspace/repository',
    roleAllows: true,
    workflowAllows: true,
  };

  const denied = [
    {
      capability: 'UNKNOWN',
    },
    {
      capability: 'FILESYSTEM_READ',
      targetPath: '../outside.txt',
    },
    {
      capability: 'FILESYSTEM_WRITE',
      targetPath: 'src/../../outside.txt',
    },
    {
      capability: 'COMMAND_EXECUTE',
      cwd: '/workspace/repository',
      timeoutMs: 0,
      envAllowlist: [],
    },
    {
      capability: 'COMMAND_EXECUTE',
      cwd: '/tmp',
      timeoutMs: 30_000,
      envAllowlist: [],
    },
    {
      capability: 'COMMAND_EXECUTE',
      cwd: '/workspace/repository',
      timeoutMs: 30_000,
    },
    {
      capability: 'NETWORK_OUTBOUND',
      roleAllows: false,
    },
    {
      capability: 'SECRET_ACCESS',
      workflowAllows: false,
    },
    {
      capability: 'DESTRUCTIVE_ACTION',
    },
    {
      capability: 'NETWORK_OUTBOUND',
      promptRequestedExpansion: true,
    },
    {
      capability: 'NETWORK_OUTBOUND',
      modelIdentityRequestedExpansion: true,
    },
  ];

  for (const mutation of denied) {
    const decision = evaluateSandboxPermission(sandboxPolicy, {
      ...base,
      ...mutation,
    });
    assert.equal(decision.allowed, false, JSON.stringify(mutation));
    assert.equal(decision.authority, 'NONE');
  }
});

test('retention abuse matrix never turns protected or ambiguous data into authorized deletion', () => {
  const evaluatedAt = '2026-09-20T12:00:00.000Z';
  const records = [
    {
      id: 'audit-expired',
      retentionClass: 'AUDIT',
      createdAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-02-01T00:00:00.000Z',
      ownerExists: true,
      auditReferenced: false,
    },
    {
      id: 'short-audit-protected',
      retentionClass: 'SHORT',
      createdAt: '2026-09-18T00:00:00.000Z',
      expiresAt: '2026-09-19T00:00:00.000Z',
      ownerExists: true,
      auditReferenced: true,
    },
    {
      id: 'short-orphan',
      retentionClass: 'SHORT',
      createdAt: '2026-09-18T00:00:00.000Z',
      expiresAt: '2026-09-19T00:00:00.000Z',
      ownerExists: false,
      auditReferenced: false,
    },
    {
      id: 'project-active',
      retentionClass: 'PROJECT',
      createdAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      ownerExists: true,
      auditReferenced: false,
      projectLifecycle: 'ACTIVE',
    },
    {
      id: 'short-expired',
      retentionClass: 'SHORT',
      createdAt: '2026-09-18T00:00:00.000Z',
      expiresAt: '2026-09-19T00:00:00.000Z',
      ownerExists: true,
      auditReferenced: false,
    },
  ];

  const forward = buildRetentionPlan(records, evaluatedAt);
  const reversed = buildRetentionPlan([...records].reverse(), evaluatedAt);
  assert.deepEqual(forward, reversed);
  assert.equal(forward.deletionAuthorized, false);
  assert.equal(forward.auditDeletionAuthorized, false);

  const actions = Object.fromEntries(forward.decisions.map((entry) => [entry.id, entry.action]));
  assert.equal(actions['audit-expired'], 'KEEP');
  assert.equal(actions['short-audit-protected'], 'KEEP');
  assert.equal(actions['short-orphan'], 'REVIEW_ORPHAN');
  assert.equal(actions['project-active'], 'KEEP');
  assert.equal(actions['short-expired'], 'PURGE_CANDIDATE');

  for (const decision of forward.decisions) assert.equal(decision.deletionAuthorized, false);
});

test('retention validation rejects ambiguous, duplicate and malformed records', () => {
  const invalidSets = [
    [
      {
        id: 'missing-expiry',
        retentionClass: 'SHORT',
        createdAt: '2026-09-20T00:00:00.000Z',
        ownerExists: true,
        auditReferenced: false,
      },
    ],
    [
      {
        id: 'project-no-lifecycle',
        retentionClass: 'PROJECT',
        createdAt: '2026-09-20T00:00:00.000Z',
        ownerExists: true,
        auditReferenced: false,
      },
    ],
    [
      {
        id: 'bad-time',
        retentionClass: 'EPHEMERAL',
        createdAt: 'not-a-time',
        expiresAt: 'also-not-a-time',
        ownerExists: true,
        auditReferenced: false,
      },
    ],
    [
      {
        id: 'duplicate',
        retentionClass: 'AUDIT',
        createdAt: '2026-09-20T00:00:00.000Z',
        ownerExists: true,
        auditReferenced: false,
      },
      {
        id: 'duplicate',
        retentionClass: 'AUDIT',
        createdAt: '2026-09-20T00:00:00.000Z',
        ownerExists: true,
        auditReferenced: false,
      },
    ],
  ];

  for (const records of invalidSets) {
    assert.equal(validateRetentionRecords(records).valid, false);
  }
});

test('hardening telemetry payload injection matrix rejects raw or arbitrary fields', () => {
  const forbiddenFields = [
    ['secret', 'raw-secret'],
    ['token', 'raw-token'],
    ['password', 'raw-password'],
    ['prompt', 'raw-prompt'],
    ['completion', 'raw-completion'],
    ['rawResponse', 'raw-response'],
    ['metadata', { arbitrary: true }],
  ];

  for (const [key, value] of forbiddenFields) {
    assert.throws(
      () =>
        createHardeningEvent({
          type: 'policy.decision',
          timestamp: '2026-09-20T12:00:00.000Z',
          runId: 'adversarial-run',
          payload: {
            category: 'policy',
            action: 'evaluate',
            outcome: 'DENY',
            reasonCode: 'ADVERSARIAL',
            [key]: value,
          },
        }),
      /field is not allowed/,
    );
  }
});

function validLineageGraph() {
  const evidence = [{ id: 'evidence-1', digest: digest('e'), provenance: 'TRUSTED' }];
  return {
    schemaVersion: 1,
    entities: [
      {
        schemaVersion: 1,
        id: 'requirement-1',
        version: 1,
        kind: 'REQUIREMENT',
        label: 'Requirement',
        digest: digest('1'),
      },
      {
        schemaVersion: 1,
        id: 'criterion-1',
        version: 1,
        kind: 'ACCEPTANCE_CRITERION',
        label: 'Criterion',
        digest: digest('2'),
      },
      {
        schemaVersion: 1,
        id: 'code-1',
        version: 1,
        kind: 'CODE_REVISION',
        label: 'Code',
        digest: digest('3'),
        revision: { repository, sha: revision },
      },
    ],
    relations: [
      {
        schemaVersion: 1,
        id: 'relation-1',
        kind: 'REFINES',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'requirement-1', version: 1 },
        to: { id: 'criterion-1', version: 1 },
        evidence,
      },
      {
        schemaVersion: 1,
        id: 'relation-2',
        kind: 'IMPLEMENTED_BY',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'criterion-1', version: 1 },
        to: { id: 'code-1', version: 1 },
        evidence,
      },
    ],
    authority: 'NONE',
    semanticSearchAuthority: 'FORBIDDEN',
    storageModel: 'RELATIONAL_FIRST',
  };
}

test('lineage mutation matrix rejects missing endpoints, untrusted evidence and bad revisions', () => {
  const mutations = [
    (graph) => {
      graph.relations[0].to = { id: 'missing', version: 1 };
    },
    (graph) => {
      graph.relations[0].evidence = [
        { id: 'untrusted', digest: digest('f'), provenance: 'UNTRUSTED' },
      ];
    },
    (graph) => {
      graph.entities[2].revision.sha = 'not-a-git-sha';
    },
    (graph) => {
      graph.relations.push({ ...graph.relations[0] });
    },
    (graph) => {
      graph.relations.push({
        schemaVersion: 1,
        id: 'discovery-authority',
        kind: 'RELATED_TO',
        relationClass: 'AUTHORITATIVE',
        from: { id: 'criterion-1', version: 1 },
        to: { id: 'code-1', version: 1 },
        evidence: [{ id: 'evidence-2', digest: digest('f'), provenance: 'TRUSTED' }],
      });
    },
  ];

  for (const mutate of mutations) {
    const graph = structuredClone(validLineageGraph());
    mutate(graph);
    assert.equal(validateLineageGraph(graph).valid, false);
  }
});

test('lineage traversal rejects depth abuse and unknown start nodes', () => {
  const graph = validLineageGraph();

  assert.throws(
    () => traverseLineage(graph, { id: 'requirement-1', version: 1 }, 11),
    /maxDepth/,
  );
  assert.throws(
    () => traverseLineage(graph, { id: 'missing', version: 1 }, 1),
    /unknown lineage start entity/,
  );
});

test('SQLite restore and inspection fail closed on unsafe targets and corrupt inputs', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'freehighlander-adversarial-sqlite-'));
  const livePath = path.join(temp, 'live.sqlite');
  const backupPath = path.join(temp, 'backup.sqlite');
  const existingTarget = path.join(temp, 'existing.sqlite');
  const corruptPath = path.join(temp, 'corrupt.sqlite');
  const store = new SqliteTelemetryStore(livePath);

  try {
    store.ingest({
      schemaVersion: 1,
      type: 'run.started',
      timestamp: '2026-09-20T12:00:00.000Z',
      runId: 'adversarial-run',
      payload: {},
    });
    await store.backupTo(backupPath);
    await writeFile(existingTarget, 'do-not-overwrite', 'utf8');
    await writeFile(corruptPath, 'not-sqlite', 'utf8');

    assert.throws(
      () => restoreSqliteTelemetryBackupToNewFile(backupPath, existingTarget),
      /never overwritten/,
    );
    assert.equal(existsSync(existingTarget), true);

    assert.throws(
      () => restoreSqliteTelemetryBackupToNewFile(backupPath, backupPath),
      /must differ from source/,
    );

    assert.throws(
      () => inspectSqliteTelemetryFile(corruptPath),
      /invalid SQLite telemetry database/,
    );
  } finally {
    store.close();
    await rm(temp, { recursive: true, force: true });
  }
});
