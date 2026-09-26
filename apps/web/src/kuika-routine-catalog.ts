import { createFhKuikaRoutineDraftV1, type FhKuikaRoutineDraftV1 } from './kuika-routines.js';

const ROUTINES = Object.freeze([
  createFhKuikaRoutineDraftV1({
    id: 'pull-request-review',
    name: 'Pull Request Review',
    trigger: {
      kind: 'GIT_EVENT',
      source: 'github',
      events: ['pull-request-opened', 'pull-request-synchronized'],
    },
    workflowRef: 'pr-review@1.0.0',
    requiredConnectorRefs: ['github'],
    concurrency: 4,
    retry: { maxAttempts: 2, backoffMs: 5_000 },
  }),
  createFhKuikaRoutineDraftV1({
    id: 'ci-failure-analysis',
    name: 'CI Failure Analysis',
    trigger: {
      kind: 'CI_EVENT',
      source: 'github-actions',
      events: ['workflow-failed'],
    },
    workflowRef: 'ci-failure-analysis@1.0.0',
    requiredConnectorRefs: ['github'],
    concurrency: 2,
    retry: { maxAttempts: 1, backoffMs: 10_000 },
  }),
  createFhKuikaRoutineDraftV1({
    id: 'release-readiness',
    name: 'Release Readiness',
    trigger: {
      kind: 'RELEASE_EVENT',
      source: 'github',
      events: ['release-candidate'],
    },
    workflowRef: 'release-readiness@1.0.0',
    requiredConnectorRefs: ['github'],
    concurrency: 1,
  }),
  createFhKuikaRoutineDraftV1({
    id: 'weekly-security-review',
    name: 'Weekly Security Review',
    trigger: {
      kind: 'CRON',
      schedule: '0 8 * * 1',
    },
    workflowRef: 'security-review@1.0.0',
    requiredConnectorRefs: ['trivy-mcp'],
    concurrency: 1,
  }),
]);

export function listFhKuikaRoutineTemplatesV1(): readonly FhKuikaRoutineDraftV1[] {
  return ROUTINES.map(cloneRoutine);
}

export function getFhKuikaRoutineTemplateV1(id: string): FhKuikaRoutineDraftV1 | null {
  const found = ROUTINES.find((routine) => routine.id === id);
  return found ? cloneRoutine(found) : null;
}

export function routineCatalogCanActivate(): false {
  return false;
}

function cloneRoutine(routine: FhKuikaRoutineDraftV1): FhKuikaRoutineDraftV1 {
  return {
    ...routine,
    trigger: {
      ...routine.trigger,
      ...(routine.trigger.events ? { events: [...routine.trigger.events] } : {}),
    },
    requiredConnectorRefs: [...routine.requiredConnectorRefs],
    secretHandleRefs: [...routine.secretHandleRefs],
    retry: { ...routine.retry },
  };
}
