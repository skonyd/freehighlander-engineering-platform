import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlanningSnapshot,
  planningCanAuthorizeExecution,
  planningCanGrantAuthority,
} from '@freehighlander/planning';
import {
  buildDevelopmentSnapshot,
  developmentCanExecuteCommands,
  developmentCanGrantAuthority,
  developmentCanMergePullRequests,
  developmentCanMutateGit,
  validateTaskCandidateBinding,
} from '@freehighlander/development';
import {
  buildTestingSnapshot,
  testPassCanAuthorizeMerge,
  testPassCanAuthorizeRelease,
  testingCanExecuteProductionMutation,
  testingCanGrantAuthority,
  validateTestRun,
} from '@freehighlander/testing';
import {
  buildSecuritySnapshot,
  securityCanExecuteProductionMutation,
  securityCanGrantAuthority,
  securityCanWaiveFinding,
  securityClearCanAuthorizeRelease,
} from '@freehighlander/security';
import {
  buildReleaseSnapshot,
  releaseCanExecuteRollback,
  releaseCanGrantAuthority,
  releaseCanPublishTagOrRelease,
  releaseReadyCanAuthorizeDeployment,
  validateReleaseCandidate,
} from '@freehighlander/release';
import {
  buildOperationsSnapshot,
  operationsCanExecuteIntent,
  operationsCanGrantAuthority,
  operationsCanMutateInfrastructure,
} from '@freehighlander/operations';
import {
  buildIncidentSnapshot,
  incidentCanAutomaticallyRemediate,
  incidentCanExecuteOperationalIntent,
  incidentCanGrantAuthority,
  incidentCanMutateInfrastructure,
} from '@freehighlander/incident';
import {
  buildLineageSnapshot,
  lineageCanGrantAuthority,
  lineageCanMutateDomain,
  lineageRequiresGraphDatabase,
  semanticSearchCanEstablishLineageAuthority,
  traverseLineage,
  validateLineageGraph,
} from '@freehighlander/lineage';

const repository = 'skonyd/freehighlander-engineering-platform';
const baseRevision = '1'.repeat(40);
const headRevision = '2'.repeat(40);
const buildRevision = '3'.repeat(40);
const deploymentRevision = '4'.repeat(40);
const digest = (character) => character.repeat(64);

function fixture() {
  const criterionId = 'AC-1';

  const plan = {
    schemaVersion: 1,
    id: 'plan-1',
    revision: 1,
    title: 'Digital thread integration',
    repository,
    baseRevision,
    status: 'READY',
    acceptanceCriteria: [{ id: criterionId, text: 'Cross-module evidence stays revision bound' }],
    workItems: [
      {
        id: 'work-1',
        title: 'Implement digital thread',
        dependsOn: [],
        acceptanceCriteria: [criterionId],
      },
    ],
    blockers: [],
  };

  const task = {
    schemaVersion: 1,
    id: 'dev-task-1',
    revision: 1,
    title: 'Implement integration',
    repository,
    baseRevision,
    status: 'CANDIDATE',
    intent: 'Implement the planned acceptance criterion',
    acceptanceCriteria: [criterionId],
    scopePaths: [{ path: 'packages/lineage/src/index.ts' }],
    blockers: [],
  };

  const candidate = {
    schemaVersion: 1,
    id: 'candidate-1',
    taskId: task.id,
    repository,
    baseRevision,
    headRevision,
    intent: task.intent,
    affectedPaths: [{ path: 'packages/lineage/src/index.ts', change: 'MODIFY' }],
    resultEvidence: [
      {
        id: 'implementation-evidence-1',
        kind: 'DIFF',
        repository,
        revision: headRevision,
        provenance: 'TRUSTED',
        digest: digest('a'),
      },
    ],
    shadowPlan: [
      {
        id: 'shadow-1',
        kind: 'ANALYZE',
        description: 'Read-only integration verification',
        affectedPaths: ['packages/lineage/src/index.ts'],
        sideEffects: 'FORBIDDEN',
        authority: 'NONE',
      },
    ],
  };

  const testPlan = {
    schemaVersion: 1,
    id: 'test-plan-1',
    revision: 1,
    developmentCandidateId: candidate.id,
    repository,
    revisionUnderTest: headRevision,
    environment: { id: 'ci', fingerprint: digest('b') },
    requiredAcceptanceCriteria: [criterionId],
    cases: [
      {
        id: 'test-1',
        title: 'Digital thread stays exact-revision bound',
        kind: 'INTEGRATION',
        required: true,
        acceptanceCriteria: [criterionId],
      },
    ],
  };

  const testRun = {
    schemaVersion: 1,
    id: 'test-run-1',
    planId: testPlan.id,
    repository,
    revision: headRevision,
    environmentFingerprint: testPlan.environment.fingerprint,
    results: [
      {
        caseId: 'test-1',
        status: 'PASS',
        repository,
        revision: headRevision,
        environmentFingerprint: testPlan.environment.fingerprint,
        evidence: [
          {
            id: 'test-evidence-1',
            kind: 'REPORT',
            digest: digest('c'),
            provenance: 'TRUSTED',
          },
        ],
      },
    ],
  };

  const securityPlan = {
    schemaVersion: 1,
    id: 'security-plan-1',
    repository,
    revision: headRevision,
    policyHash: digest('d'),
    requiredScanners: [{ id: 'scanner-1', version: '1.0.0' }],
  };

  const securityAssessment = {
    schemaVersion: 1,
    id: 'security-assessment-1',
    planId: securityPlan.id,
    repository,
    revision: headRevision,
    policyHash: securityPlan.policyHash,
    scannerEvidence: [
      {
        id: 'security-evidence-1',
        scannerId: 'scanner-1',
        scannerVersion: '1.0.0',
        repository,
        revision: headRevision,
        policyHash: securityPlan.policyHash,
        provenance: 'TRUSTED',
        digest: digest('e'),
      },
    ],
    findings: [],
  };

  const manifest = {
    schemaVersion: 1,
    id: 'manifest-1',
    repository,
    sourceRevision: headRevision,
    buildRevision,
    artifacts: [
      {
        id: 'artifact-1',
        path: 'dist/freehighlander.tgz',
        digest: digest('f'),
        mediaType: 'application/gzip',
      },
    ],
  };

  const releaseCandidate = {
    schemaVersion: 1,
    id: 'release-1',
    repository,
    sourceRevision: headRevision,
    buildRevision,
    artifactManifestId: manifest.id,
    evidence: ['DEVELOPMENT', 'TESTING', 'SECURITY', 'BUILD', 'PROVENANCE'].map((kind, index) => ({
      id: `release-evidence-${index + 1}`,
      kind,
      repository,
      revision: headRevision,
      digest: digest(String((index + 1) % 10)),
      provenance: 'TRUSTED',
      state: 'PASS',
    })),
    rollbackPlan: {
      id: 'rollback-1',
      version: 1,
      targetRevision: baseRevision,
      steps: ['restore previous immutable artifact'],
      verified: true,
    },
  };

  const service = {
    schemaVersion: 1,
    id: 'service-1',
    name: 'FreeHighlander',
    criticality: 'HIGH',
    environment: 'staging',
    resources: [
      {
        id: 'resource-1',
        kind: 'SERVICE',
        environment: 'staging',
        locator: 'service/freehighlander',
      },
    ],
    runbookIds: [],
  };

  const health = {
    schemaVersion: 1,
    id: 'health-1',
    serviceId: service.id,
    environment: service.environment,
    observedAt: '2026-09-20T12:00:00.000Z',
    resources: [
      {
        resourceId: 'resource-1',
        status: 'HEALTHY',
        evidenceIds: ['health-evidence-1'],
        observedAt: '2026-09-20T12:00:00.000Z',
      },
    ],
    evidence: [
      {
        id: 'health-evidence-1',
        resourceId: 'resource-1',
        observedAt: '2026-09-20T12:00:00.000Z',
        provenance: 'TRUSTED',
        digest: digest('9'),
      },
    ],
  };

  const incidentBinding = {
    serviceId: service.id,
    environment: service.environment,
    resourceIds: ['resource-1'],
  };

  const incident = {
    schemaVersion: 1,
    id: 'incident-1',
    serviceId: service.id,
    environment: service.environment,
    severity: 'SEV3',
    status: 'OPEN',
    title: 'Synthetic read-only integration incident',
    affectedResources: [{ resourceId: 'resource-1' }],
    evidence: [{ id: 'incident-evidence-1', digest: digest('8'), provenance: 'TRUSTED' }],
    timeline: [
      {
        id: 'incident-event-1',
        incidentId: 'incident-1',
        kind: 'DECLARED',
        occurredAt: '2026-09-20T12:01:00.000Z',
        actor: 'integration-test',
        evidenceIds: ['incident-evidence-1'],
      },
    ],
    operationalIntentIds: [],
    authority: 'NONE',
    automaticRemediation: 'FORBIDDEN',
  };

  const ref = (id) => ({ id, version: 1 });
  const evidence = (id, value) => [{ id, digest: digest(value), provenance: 'TRUSTED' }];
  const entities = [
    {
      schemaVersion: 1,
      id: 'req-1',
      version: 1,
      kind: 'REQUIREMENT',
      label: 'Requirement',
      digest: digest('1'),
    },
    {
      schemaVersion: 1,
      id: criterionId,
      version: 1,
      kind: 'ACCEPTANCE_CRITERION',
      label: 'Acceptance criterion',
      digest: digest('2'),
    },
    {
      schemaVersion: 1,
      id: 'code-1',
      version: 1,
      kind: 'CODE_REVISION',
      label: 'Code revision',
      digest: digest('3'),
      revision: { repository, sha: headRevision },
    },
    {
      schemaVersion: 1,
      id: 'test-evidence-entity-1',
      version: 1,
      kind: 'TEST_EVIDENCE',
      label: 'Test evidence',
      digest: digest('4'),
    },
    {
      schemaVersion: 1,
      id: 'security-evidence-entity-1',
      version: 1,
      kind: 'SECURITY_EVIDENCE',
      label: 'Security evidence',
      digest: digest('5'),
    },
    {
      schemaVersion: 1,
      id: 'build-1',
      version: 1,
      kind: 'BUILD',
      label: 'Build',
      digest: digest('6'),
      revision: { repository, sha: buildRevision },
    },
    {
      schemaVersion: 1,
      id: 'release-entity-1',
      version: 1,
      kind: 'RELEASE',
      label: 'Release',
      digest: digest('7'),
      revision: { repository, sha: buildRevision },
    },
    {
      schemaVersion: 1,
      id: 'deployment-1',
      version: 1,
      kind: 'DEPLOYMENT',
      label: 'Deployment',
      digest: digest('8'),
      revision: { repository, sha: deploymentRevision },
    },
    {
      schemaVersion: 1,
      id: 'observation-1',
      version: 1,
      kind: 'RUNTIME_OBSERVATION',
      label: 'Runtime health',
      digest: digest('9'),
    },
    {
      schemaVersion: 1,
      id: incident.id,
      version: 1,
      kind: 'INCIDENT',
      label: incident.title,
      digest: digest('a'),
    },
  ];

  const lineage = {
    schemaVersion: 1,
    entities,
    relations: [
      {
        schemaVersion: 1,
        id: 'rel-1',
        kind: 'REFINES',
        relationClass: 'AUTHORITATIVE',
        from: ref('req-1'),
        to: ref(criterionId),
        evidence: evidence('rel-e1', 'b'),
      },
      {
        schemaVersion: 1,
        id: 'rel-2',
        kind: 'IMPLEMENTED_BY',
        relationClass: 'AUTHORITATIVE',
        from: ref(criterionId),
        to: ref('code-1'),
        evidence: evidence('rel-e2', 'c'),
      },
      {
        schemaVersion: 1,
        id: 'rel-3',
        kind: 'VERIFIED_BY',
        relationClass: 'AUTHORITATIVE',
        from: ref(criterionId),
        to: ref('test-evidence-entity-1'),
        evidence: evidence('rel-e3', 'd'),
      },
      {
        schemaVersion: 1,
        id: 'rel-4',
        kind: 'SECURED_BY',
        relationClass: 'AUTHORITATIVE',
        from: ref('code-1'),
        to: ref('security-evidence-entity-1'),
        evidence: evidence('rel-e4', 'e'),
      },
      {
        schemaVersion: 1,
        id: 'rel-5',
        kind: 'BUILT_FROM',
        relationClass: 'AUTHORITATIVE',
        from: ref('build-1'),
        to: ref('code-1'),
        evidence: evidence('rel-e5', 'f'),
      },
      {
        schemaVersion: 1,
        id: 'rel-6',
        kind: 'RELEASES',
        relationClass: 'AUTHORITATIVE',
        from: ref('release-entity-1'),
        to: ref('build-1'),
        evidence: evidence('rel-e6', '1'),
      },
      {
        schemaVersion: 1,
        id: 'rel-7',
        kind: 'DEPLOYED_AS',
        relationClass: 'AUTHORITATIVE',
        from: ref('deployment-1'),
        to: ref('release-entity-1'),
        evidence: evidence('rel-e7', '2'),
      },
      {
        schemaVersion: 1,
        id: 'rel-8',
        kind: 'OBSERVED_BY',
        relationClass: 'AUTHORITATIVE',
        from: ref('deployment-1'),
        to: ref('observation-1'),
        evidence: evidence('rel-e8', '3'),
      },
      {
        schemaVersion: 1,
        id: 'rel-9',
        kind: 'INVOLVED_IN',
        relationClass: 'AUTHORITATIVE',
        from: ref('observation-1'),
        to: ref(incident.id),
        evidence: evidence('rel-e9', '4'),
      },
    ],
    authority: 'NONE',
    semanticSearchAuthority: 'FORBIDDEN',
    storageModel: 'RELATIONAL_FIRST',
  };

  return {
    criterionId,
    plan,
    task,
    candidate,
    testPlan,
    testRun,
    securityPlan,
    securityAssessment,
    manifest,
    releaseCandidate,
    service,
    health,
    incidentBinding,
    incident,
    lineage,
  };
}

test('FH-30A..FH-37A compose into a deterministic authority-neutral digital thread', async () => {
  const data = fixture();

  assert.equal(validateTaskCandidateBinding(data.task, data.candidate).valid, true);
  assert.equal(validateTestRun(data.testPlan, data.testRun).valid, true);
  assert.equal(validateReleaseCandidate(data.manifest, data.releaseCandidate).valid, true);
  assert.equal(validateLineageGraph(data.lineage).valid, true);

  const snapshots = await Promise.all([
    buildPlanningSnapshot(data.plan),
    buildDevelopmentSnapshot(data.candidate),
    buildTestingSnapshot(data.testPlan, data.testRun),
    buildSecuritySnapshot(data.securityPlan, data.securityAssessment),
    buildReleaseSnapshot(data.manifest, data.releaseCandidate),
    buildOperationsSnapshot(data.service, data.health),
    buildIncidentSnapshot(data.incidentBinding, data.incident),
    buildLineageSnapshot(data.lineage),
  ]);

  for (const snapshot of snapshots) assert.equal(snapshot.authority, 'NONE');

  const secondLineageSnapshot = await buildLineageSnapshot({
    ...data.lineage,
    entities: [...data.lineage.entities].reverse(),
    relations: [...data.lineage.relations].reverse(),
  });
  assert.equal(snapshots[7].snapshotHash, secondLineageSnapshot.snapshotHash);

  const traversal = traverseLineage(data.lineage, { id: 'req-1', version: 1 }, 3);
  assert.deepEqual(
    traversal.map((node) => [node.ref.id, node.depth]),
    [
      ['req-1', 0],
      [data.criterionId, 1],
      ['code-1', 2],
      ['test-evidence-entity-1', 2],
      ['security-evidence-entity-1', 3],
    ],
  );

  assert.equal(planningCanGrantAuthority(), false);
  assert.equal(planningCanAuthorizeExecution(), false);
  assert.equal(developmentCanGrantAuthority(), false);
  assert.equal(developmentCanExecuteCommands(), false);
  assert.equal(developmentCanMutateGit(), false);
  assert.equal(developmentCanMergePullRequests(), false);
  assert.equal(testingCanGrantAuthority(), false);
  assert.equal(testPassCanAuthorizeMerge(), false);
  assert.equal(testPassCanAuthorizeRelease(), false);
  assert.equal(testingCanExecuteProductionMutation(), false);
  assert.equal(securityCanGrantAuthority(), false);
  assert.equal(securityCanWaiveFinding(), false);
  assert.equal(securityClearCanAuthorizeRelease(), false);
  assert.equal(securityCanExecuteProductionMutation(), false);
  assert.equal(releaseCanGrantAuthority(), false);
  assert.equal(releaseReadyCanAuthorizeDeployment(), false);
  assert.equal(releaseCanPublishTagOrRelease(), false);
  assert.equal(releaseCanExecuteRollback(), false);
  assert.equal(operationsCanGrantAuthority(), false);
  assert.equal(operationsCanMutateInfrastructure(), false);
  assert.equal(operationsCanExecuteIntent(), false);
  assert.equal(incidentCanGrantAuthority(), false);
  assert.equal(incidentCanMutateInfrastructure(), false);
  assert.equal(incidentCanExecuteOperationalIntent(), false);
  assert.equal(incidentCanAutomaticallyRemediate(), false);
  assert.equal(lineageCanGrantAuthority(), false);
  assert.equal(lineageCanMutateDomain(), false);
  assert.equal(semanticSearchCanEstablishLineageAuthority(), false);
  assert.equal(lineageRequiresGraphDatabase(), false);
});

test('cross-module revision mismatches fail closed', () => {
  const data = fixture();

  const badTestRun = { ...data.testRun, revision: baseRevision };
  const testValidation = validateTestRun(data.testPlan, badTestRun);
  assert.equal(testValidation.valid, false);
  assert.match(testValidation.errors.join('\n'), /revision must match/);

  const badRelease = {
    ...data.releaseCandidate,
    evidence: data.releaseCandidate.evidence.map((entry, index) =>
      index === 0 ? { ...entry, revision: baseRevision } : entry,
    ),
  };
  const releaseValidation = validateReleaseCandidate(data.manifest, badRelease);
  assert.equal(releaseValidation.valid, false);
  assert.match(releaseValidation.errors.join('\n'), /revision must match/);

  const badLineage = {
    ...data.lineage,
    entities: data.lineage.entities.map((entity) =>
      entity.id === 'code-1'
        ? { ...entity, revision: { repository, sha: 'not-a-git-sha' } }
        : entity,
    ),
  };
  const lineageValidation = validateLineageGraph(badLineage);
  assert.equal(lineageValidation.valid, false);
  assert.match(lineageValidation.errors.join('\n'), /revision sha must be lowercase git sha/);
});
