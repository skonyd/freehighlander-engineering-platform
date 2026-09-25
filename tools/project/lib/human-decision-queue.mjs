import path from 'node:path';

import {
  createHumanDecisionQueueEntry,
  evaluateHumanDecisionResume,
  validateHumanDecisionQueueEntry,
  validateHumanDecisionResponseV1,
} from '../../../packages/orchestration/dist/index.js';
import { AtomicJsonConfigStore } from '../../../packages/persistence/dist/index.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function humanDecisionQueueFile(root, projectId) {
  requireProjectId(projectId);
  return path.join(root, '.freehighlander', 'runtime', 'human-decisions', projectId + '.json');
}

export function createHumanDecisionQueueStore(root, projectId) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('root is required');
  requireProjectId(projectId);
  return new AtomicJsonConfigStore(humanDecisionQueueFile(root, projectId), (value) =>
    validateHumanDecisionQueueStateV1(value, projectId),
  );
}

export function readHumanDecisionQueue(store, projectId) {
  requireProjectId(projectId);
  const snapshot = store.read();
  if (snapshot === null) {
    return {
      generation: 0,
      snapshotHash: null,
      state: emptyHumanDecisionQueueState(projectId),
    };
  }
  return {
    generation: snapshot.generation,
    snapshotHash: snapshot.snapshotHash,
    state: validateHumanDecisionQueueStateV1(snapshot.payload, projectId),
  };
}

export function enqueueHumanDecision(store, expectedGeneration, entry) {
  validateHumanDecisionQueueEntry(entry);
  const current = readHumanDecisionQueue(store, entry.projectId);
  if (current.generation !== expectedGeneration) {
    return generationConflict(expectedGeneration, current.generation);
  }

  const existing = current.state.entries.find((candidate) => candidate.decisionId === entry.decisionId);
  if (existing) {
    if (existing.decisionHash !== entry.decisionHash) {
      throw new Error('human decision id already exists with different identity');
    }
    return {
      status: 'ALREADY_QUEUED',
      generation: current.generation,
      snapshotHash: current.snapshotHash,
      decisionId: entry.decisionId,
      authority: 'NONE',
    };
  }

  const next = {
    ...current.state,
    entries: [...current.state.entries, entry].sort((left, right) =>
      left.decisionId.localeCompare(right.decisionId),
    ),
  };
  const result = store.write(expectedGeneration, next);
  if (result.status !== 'WRITTEN' || result.snapshot === null) {
    return atomicConflict(result, expectedGeneration);
  }
  const verified = validateHumanDecisionQueueStateV1(result.snapshot.payload, entry.projectId);
  const persisted = verified.entries.find((candidate) => candidate.decisionId === entry.decisionId);
  if (!persisted || persisted.decisionHash !== entry.decisionHash) {
    throw new Error('human decision queue read-back verification failed');
  }
  return {
    status: 'QUEUED',
    generation: result.snapshot.generation,
    snapshotHash: result.snapshot.snapshotHash,
    decisionId: entry.decisionId,
    authority: 'NONE',
  };
}

export function resolveHumanDecision(
  store,
  expectedGeneration,
  response,
  context,
) {
  validateHumanDecisionResponseV1(response);
  const currentSnapshot = store.read();
  if (currentSnapshot === null) {
    throw new Error('human decision queue is empty');
  }
  if (currentSnapshot.generation !== expectedGeneration) {
    return generationConflict(expectedGeneration, currentSnapshot.generation);
  }

  const rawState = validateHumanDecisionQueueStateV1(currentSnapshot.payload);
  const entry = rawState.entries.find((candidate) => candidate.decisionId === response.decisionId);
  if (!entry) throw new Error('human decision response references an unknown parked decision');

  const decision = evaluateHumanDecisionResume(entry, response, context);
  if (decision.status !== 'RESUME_READY') {
    return {
      status: decision.status,
      generation: currentSnapshot.generation,
      snapshotHash: currentSnapshot.snapshotHash,
      decisionId: response.decisionId,
      reasons: decision.reasons,
      staleDimensions: decision.staleDimensions,
      mutated: false,
      authority: 'NONE',
    };
  }

  const next = {
    ...rawState,
    entries: rawState.entries.filter((candidate) => candidate.decisionId !== response.decisionId),
    responses: [...rawState.responses, response].sort((left, right) =>
      left.respondedAt === right.respondedAt
        ? left.responseHash.localeCompare(right.responseHash)
        : left.respondedAt.localeCompare(right.respondedAt),
    ),
  };
  const result = store.write(expectedGeneration, next);
  if (result.status !== 'WRITTEN' || result.snapshot === null) {
    return atomicConflict(result, expectedGeneration);
  }
  const verified = validateHumanDecisionQueueStateV1(result.snapshot.payload, entry.projectId);
  if (verified.entries.some((candidate) => candidate.decisionId === entry.decisionId)) {
    throw new Error('resolved human decision remained parked after persistence');
  }
  if (!verified.responses.some((candidate) => candidate.responseHash === response.responseHash)) {
    throw new Error('human decision response read-back verification failed');
  }

  return {
    status: 'RESOLVED',
    generation: result.snapshot.generation,
    snapshotHash: result.snapshot.snapshotHash,
    decisionId: entry.decisionId,
    responseHash: response.responseHash,
    mutated: true,
    authority: 'NONE',
  };
}

export function validateHumanDecisionQueueStateV1(value, expectedProjectId = null) {
  if (!isRecord(value)) throw new Error('human decision queue state must be an object');
  assertExactKeys(value, ['schemaVersion', 'projectId', 'entries', 'responses', 'authority']);
  if (value.schemaVersion !== 1) throw new Error('human decision queue schemaVersion must be 1');
  if (value.authority !== 'NONE') throw new Error('human decision queue authority must be NONE');
  requireProjectId(value.projectId);
  if (expectedProjectId !== null && value.projectId !== expectedProjectId) {
    throw new Error('human decision queue project identity mismatch');
  }
  if (!Array.isArray(value.entries)) throw new Error('human decision queue entries must be an array');
  if (!Array.isArray(value.responses)) {
    throw new Error('human decision queue responses must be an array');
  }

  const entries = value.entries.map((entry) => {
    validateHumanDecisionQueueEntry(entry);
    if (entry.projectId !== value.projectId) {
      throw new Error('human decision queue entry project identity mismatch');
    }
    return clone(entry);
  });
  const decisionIds = new Set();
  for (const entry of entries) {
    if (decisionIds.has(entry.decisionId)) {
      throw new Error('duplicate human decision queue decisionId');
    }
    decisionIds.add(entry.decisionId);
  }
  entries.sort((left, right) => left.decisionId.localeCompare(right.decisionId));

  const responses = value.responses.map((response) => {
    validateHumanDecisionResponseV1(response);
    return clone(response);
  });
  const responseHashes = new Set();
  for (const response of responses) {
    if (responseHashes.has(response.responseHash)) {
      throw new Error('duplicate human decision response hash');
    }
    responseHashes.add(response.responseHash);
    if (entries.some((entry) => entry.decisionId === response.decisionId)) {
      throw new Error('resolved decision cannot remain in the parked queue');
    }
  }
  responses.sort((left, right) =>
    left.respondedAt === right.respondedAt
      ? left.responseHash.localeCompare(right.responseHash)
      : left.respondedAt.localeCompare(right.respondedAt),
  );

  return {
    schemaVersion: 1,
    projectId: value.projectId,
    entries,
    responses,
    authority: 'NONE',
  };
}

export function humanDecisionQueueCanGrantAuthority() {
  return false;
}

export function humanDecisionQueueCanStoreSecretValues() {
  return false;
}

function emptyHumanDecisionQueueState(projectId) {
  return {
    schemaVersion: 1,
    projectId,
    entries: [],
    responses: [],
    authority: 'NONE',
  };
}

function generationConflict(expectedGeneration, actualGeneration) {
  return {
    status: 'GENERATION_CONFLICT',
    expectedGeneration,
    actualGeneration,
    mutated: false,
    authority: 'NONE',
  };
}

function atomicConflict(result, expectedGeneration) {
  return {
    status: result.status,
    expectedGeneration,
    actualGeneration: result.actualGeneration,
    mutated: false,
    authority: 'NONE',
  };
}

function assertExactKeys(record, keys) {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error('human decision queue field is not allowed: ' + key);
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error('human decision queue field is required: ' + key);
    }
  }
}

function requireProjectId(value) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error('projectId must be a bounded identifier');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
