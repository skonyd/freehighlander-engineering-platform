export type RuntimeCancellationReason =
  'USER_CANCEL' | 'DEADLINE_EXCEEDED' | 'SHUTDOWN' | 'PARENT_CANCELLED';

export type RuntimeActivityLifecycleState =
  'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';

export interface RuntimeCancellationActivity {
  readonly id: string;
  readonly parentId: string | null;
  readonly state: RuntimeActivityLifecycleState;
  readonly supportsCancellation: boolean;
}

export type RuntimeCancellationActionKind =
  | 'CANCEL_BEFORE_START'
  | 'SIGNAL_CANCEL'
  | 'DRAIN_UNINTERRUPTIBLE'
  | 'ALREADY_REQUESTED'
  | 'NO_ACTION';

export interface RuntimeCancellationAction {
  readonly activityId: string;
  readonly action: RuntimeCancellationActionKind;
  readonly cancellationSignalRequired: boolean;
  readonly resourceReleaseRequired: boolean;
}

export interface RuntimeCancellationPlan {
  readonly rootActivityId: string;
  readonly reason: RuntimeCancellationReason;
  readonly actions: readonly RuntimeCancellationAction[];
  readonly semanticFailure: false;
  readonly modelShoppingAllowed: false;
  readonly authority: 'NONE';
}

export type RuntimeDrainState = 'RUNNING' | 'DRAINING' | 'CHECKPOINTED' | 'RELEASING' | 'STOPPED';

export interface RuntimeDrainEvidence {
  readonly acceptingNewWork: boolean;
  readonly safeCheckpointPersisted: boolean;
  readonly activitiesSettled: boolean;
  readonly permitsReleased: boolean;
  readonly leasesReleased: boolean;
  readonly secretReceiptsRevoked: boolean;
}

export interface RuntimeDrainTransition {
  readonly from: RuntimeDrainState;
  readonly to: RuntimeDrainState;
  readonly authority: 'NONE';
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export function planRuntimeCancellation(
  activities: readonly RuntimeCancellationActivity[],
  rootActivityId: string,
  reason: RuntimeCancellationReason,
): RuntimeCancellationPlan {
  requireId(rootActivityId, 'rootActivityId');
  validateCancellationReason(reason);
  const byId = validateActivities(activities);
  if (!byId.has(rootActivityId)) {
    throw new Error('unknown cancellation root activity');
  }

  const descendants = collectDescendants(byId, rootActivityId);
  return {
    rootActivityId,
    reason,
    actions: descendants.map((activity) => cancellationAction(activity)),
    semanticFailure: false,
    modelShoppingAllowed: false,
    authority: 'NONE',
  };
}

export function transitionRuntimeDrain(
  from: RuntimeDrainState,
  to: RuntimeDrainState,
  evidence: RuntimeDrainEvidence,
): RuntimeDrainTransition {
  validateDrainState(from);
  validateDrainState(to);

  const expected = nextDrainState(from);
  if (expected === null || to !== expected) {
    throw new Error('illegal graceful-drain transition: ' + from + ' -> ' + to);
  }
  if (evidence.acceptingNewWork) {
    throw new Error('graceful drain must stop accepting new work before transition');
  }

  if (to === 'CHECKPOINTED' && !evidence.safeCheckpointPersisted) {
    throw new Error('graceful drain requires a persisted safe checkpoint');
  }
  if (to === 'RELEASING' && !evidence.activitiesSettled) {
    throw new Error('graceful drain requires activities to settle before resource release');
  }
  if (
    to === 'STOPPED' &&
    (!evidence.activitiesSettled ||
      !evidence.permitsReleased ||
      !evidence.leasesReleased ||
      !evidence.secretReceiptsRevoked)
  ) {
    throw new Error('graceful drain cannot stop before all runtime resources are released');
  }

  return { from, to, authority: 'NONE' };
}

export function runtimeDrainAcceptsNewWork(state: RuntimeDrainState): boolean {
  validateDrainState(state);
  return state === 'RUNNING';
}

export function cancellationCanTriggerModelShopping(): false {
  return false;
}

export function cancellationCountsAsSemanticFailure(): false {
  return false;
}

export function cancellationCanSkipResourceRelease(): false {
  return false;
}

export function queuedWaitCountsAsExecutionTime(): false {
  return false;
}

export function gracefulDrainCanGrantAuthority(): false {
  return false;
}

function cancellationAction(activity: RuntimeCancellationActivity): RuntimeCancellationAction {
  if (activity.state === 'QUEUED') {
    return {
      activityId: activity.id,
      action: 'CANCEL_BEFORE_START',
      cancellationSignalRequired: false,
      resourceReleaseRequired: true,
    };
  }

  if (activity.state === 'RUNNING') {
    return {
      activityId: activity.id,
      action: activity.supportsCancellation ? 'SIGNAL_CANCEL' : 'DRAIN_UNINTERRUPTIBLE',
      cancellationSignalRequired: activity.supportsCancellation,
      resourceReleaseRequired: true,
    };
  }

  if (activity.state === 'CANCEL_REQUESTED') {
    return {
      activityId: activity.id,
      action: 'ALREADY_REQUESTED',
      cancellationSignalRequired: false,
      resourceReleaseRequired: true,
    };
  }

  return {
    activityId: activity.id,
    action: 'NO_ACTION',
    cancellationSignalRequired: false,
    resourceReleaseRequired: false,
  };
}

function validateActivities(
  activities: readonly RuntimeCancellationActivity[],
): ReadonlyMap<string, RuntimeCancellationActivity> {
  if (activities.length === 0) throw new Error('cancellation activity set cannot be empty');

  const byId = new Map<string, RuntimeCancellationActivity>();
  for (const activity of activities) {
    requireId(activity.id, 'activity id');
    if (byId.has(activity.id))
      throw new Error('duplicate cancellation activity id: ' + activity.id);
    validateActivityState(activity.state);
    byId.set(activity.id, activity);
  }

  for (const activity of activities) {
    if (activity.parentId === null) continue;
    requireId(activity.parentId, 'parent activity id');
    if (activity.parentId === activity.id) throw new Error('activity cannot parent itself');
    if (!byId.has(activity.parentId)) {
      throw new Error('unknown parent activity: ' + activity.parentId);
    }
  }

  assertAcyclic(byId);
  return byId;
}

function collectDescendants(
  byId: ReadonlyMap<string, RuntimeCancellationActivity>,
  rootActivityId: string,
): readonly RuntimeCancellationActivity[] {
  const children = new Map<string, string[]>();
  for (const activity of byId.values()) {
    if (activity.parentId === null) continue;
    const list = children.get(activity.parentId) ?? [];
    list.push(activity.id);
    list.sort();
    children.set(activity.parentId, list);
  }

  const ordered: RuntimeCancellationActivity[] = [];
  const queue = [rootActivityId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const activity = byId.get(id) as RuntimeCancellationActivity;
    ordered.push(activity);
    queue.push(...(children.get(id) ?? []));
  }
  return ordered;
}

function assertAcyclic(byId: ReadonlyMap<string, RuntimeCancellationActivity>): void {
  for (const activity of byId.values()) {
    const seen = new Set<string>();
    let current = activity;
    while (current.parentId !== null) {
      if (seen.has(current.id)) throw new Error('cancellation activity graph must be acyclic');
      seen.add(current.id);
      current = byId.get(current.parentId) as RuntimeCancellationActivity;
    }
  }
}

function nextDrainState(state: RuntimeDrainState): RuntimeDrainState | null {
  if (state === 'RUNNING') return 'DRAINING';
  if (state === 'DRAINING') return 'CHECKPOINTED';
  if (state === 'CHECKPOINTED') return 'RELEASING';
  if (state === 'RELEASING') return 'STOPPED';
  return null;
}

function validateCancellationReason(reason: RuntimeCancellationReason): void {
  if (
    reason !== 'USER_CANCEL' &&
    reason !== 'DEADLINE_EXCEEDED' &&
    reason !== 'SHUTDOWN' &&
    reason !== 'PARENT_CANCELLED'
  ) {
    throw new Error('unsupported cancellation reason');
  }
}

function validateActivityState(state: RuntimeActivityLifecycleState): void {
  if (
    state !== 'QUEUED' &&
    state !== 'RUNNING' &&
    state !== 'CANCEL_REQUESTED' &&
    state !== 'CANCELLED' &&
    state !== 'COMPLETED' &&
    state !== 'FAILED'
  ) {
    throw new Error('unsupported activity lifecycle state');
  }
}

function validateDrainState(state: RuntimeDrainState): void {
  if (
    state !== 'RUNNING' &&
    state !== 'DRAINING' &&
    state !== 'CHECKPOINTED' &&
    state !== 'RELEASING' &&
    state !== 'STOPPED'
  ) {
    throw new Error('unsupported runtime drain state');
  }
}

function requireId(value: string, name: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(name + ' must be a bounded identifier');
}
