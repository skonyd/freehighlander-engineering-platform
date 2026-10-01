import type { AuthorityCapabilityId } from './authority-capability-registry.js';

export type BLaneModuleId =
  'FH-30B' | 'FH-31B' | 'FH-32B' | 'FH-33B' | 'FH-34B' | 'FH-35B' | 'FH-36B' | 'FH-37B';

export interface BLaneModuleDefinitionV1 {
  readonly id: BLaneModuleId;
  readonly label: string;
  readonly description: string;
  readonly implementationStatus: 'OPERATIONAL';
  readonly requiredCapabilities: readonly AuthorityCapabilityId[];
  readonly conditionalCapabilities: readonly AuthorityCapabilityId[];
  readonly authorityEffect: 'NONE' | 'CAPABILITY_GATED';
}

export const B_LANE_MODULE_REGISTRY_V1: readonly BLaneModuleDefinitionV1[] = Object.freeze([
  {
    id: 'FH-30B',
    label: 'Planning',
    description: 'Authoritative plan transitions and capability-scoped execution intents.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: [],
    conditionalCapabilities: [],
    authorityEffect: 'NONE',
  },
  {
    id: 'FH-31B',
    label: 'Development',
    description: 'Local Git mutation executor behind GIT_WRITE.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: ['GIT_WRITE'],
    conditionalCapabilities: [],
    authorityEffect: 'CAPABILITY_GATED',
  },
  {
    id: 'FH-32B',
    label: 'Testing',
    description: 'Authoritative test orchestration and digest-bound evidence capture.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: [],
    conditionalCapabilities: [],
    authorityEffect: 'NONE',
  },
  {
    id: 'FH-33B',
    label: 'Security',
    description: 'Authoritative scanner evidence and exact human-approved waiver application.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: [],
    conditionalCapabilities: [],
    authorityEffect: 'NONE',
  },
  {
    id: 'FH-34B',
    label: 'Release',
    description: 'Release, deploy and rollback mutation adapter behind RELEASE_DEPLOY.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: ['RELEASE_DEPLOY'],
    conditionalCapabilities: [],
    authorityEffect: 'CAPABILITY_GATED',
  },
  {
    id: 'FH-35B',
    label: 'Operations',
    description: 'Infrastructure mutation and runbook adapter behind INFRASTRUCTURE_MUTATION.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: ['INFRASTRUCTURE_MUTATION'],
    conditionalCapabilities: [],
    authorityEffect: 'CAPABILITY_GATED',
  },
  {
    id: 'FH-36B',
    label: 'Incident',
    description: 'Automatic remediation adapter with additional infrastructure gate when required.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: ['AUTOMATIC_REMEDIATION'],
    conditionalCapabilities: ['INFRASTRUCTURE_MUTATION'],
    authorityEffect: 'CAPABILITY_GATED',
  },
  {
    id: 'FH-37B',
    label: 'Lineage',
    description: 'Append-only mutation lineage with restart-safe hash-chain verification.',
    implementationStatus: 'OPERATIONAL',
    requiredCapabilities: [],
    conditionalCapabilities: [],
    authorityEffect: 'NONE',
  },
]);

export function getBLaneModuleDefinitionV1(id: BLaneModuleId): BLaneModuleDefinitionV1 {
  const definition = B_LANE_MODULE_REGISTRY_V1.find((candidate) => candidate.id === id);
  if (!definition) throw new Error('unknown B-lane module');
  return definition;
}

export function bLaneModuleRegistryCanGrantAuthority(): false {
  return false;
}
