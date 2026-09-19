export type EventType =
  | 'run.started'
  | 'run.completed'
  | 'gate.started'
  | 'gate.completed'
  | 'model.call.started'
  | 'model.call.completed'
  | 'artifact.created'
  | 'artifact.invalidated'
  | 'candidate.created'
  | 'finding.adjudicated'
  | 'human.required'
  | 'human.decision'
  | 'provider.unavailable'
  | 'quota.exhausted';

export interface EngineeringEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly schemaVersion: 1;
  readonly type: EventType;
  readonly timestamp: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly workflowId?: string;
  readonly workflowVersion?: string;
  readonly nodeId?: string;
  readonly payload: TPayload;
}

export function createEvent<TPayload extends Record<string, unknown>>(
  event: Omit<EngineeringEvent<TPayload>, 'schemaVersion'>,
): EngineeringEvent<TPayload> {
  return {
    schemaVersion: 1,
    ...event,
  };
}

export function serializeEvent(event: EngineeringEvent): string {
  return JSON.stringify(event);
}

export interface EventSink {
  append(event: EngineeringEvent): Promise<void>;
}
