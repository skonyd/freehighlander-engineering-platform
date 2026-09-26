import {
  publishFhKuikaBlueprintV1,
  type FhKuikaBlueprintDraftV1,
  type FhKuikaBlueprintIntent,
  type FhKuikaPublishedBlueprintV1,
} from './kuika-blueprint.js';

interface CuratedBlueprintDefinition {
  readonly id: string;
  readonly intent: FhKuikaBlueprintIntent;
  readonly purpose: string;
  readonly risk: FhKuikaBlueprintDraftV1['defaultRiskTier'];
  readonly stages: readonly string[];
  readonly roles: readonly string[];
  readonly evidence: readonly string[];
  readonly authoritySensitiveNodes: readonly string[];
  readonly independenceRequired: boolean;
}

const DEFINITIONS: readonly CuratedBlueprintDefinition[] = [
  {
    id: 'feature-implementation',
    intent: 'FEATURE_IMPLEMENTATION',
    purpose: 'Plan, implement, test and independently review a bounded feature change.',
    risk: 'NORMAL',
    stages: ['PLAN', 'IMPLEMENT', 'TEST', 'REVIEW'],
    roles: ['implementation-agent', 'test-reviewer'],
    evidence: ['change-set', 'test-results', 'review-result'],
    authoritySensitiveNodes: ['final-review'],
    independenceRequired: true,
  },
  {
    id: 'bug-fix',
    intent: 'BUG_FIX',
    purpose: 'Reproduce, repair, test and independently review a bounded defect.',
    risk: 'NORMAL',
    stages: ['REPRODUCE', 'IMPLEMENT', 'TEST', 'REVIEW'],
    roles: ['implementation-agent', 'test-reviewer'],
    evidence: ['reproduction-evidence', 'change-set', 'test-results', 'review-result'],
    authoritySensitiveNodes: ['final-review'],
    independenceRequired: true,
  },
  {
    id: 'security-patch',
    intent: 'SECURITY_PATCH',
    purpose: 'Patch a confirmed security issue with test and independent security review evidence.',
    risk: 'HIGH',
    stages: ['ASSESS', 'IMPLEMENT', 'TEST', 'SECURITY_REVIEW', 'REVIEW'],
    roles: ['implementation-agent', 'test-reviewer', 'security-reviewer'],
    evidence: ['security-finding', 'change-set', 'test-results', 'security-review-result'],
    authoritySensitiveNodes: ['security-gate', 'final-review'],
    independenceRequired: true,
  },
  {
    id: 'dependency-upgrade',
    intent: 'DEPENDENCY_UPGRADE',
    purpose: 'Upgrade a dependency with compatibility, security and regression evidence.',
    risk: 'NORMAL',
    stages: ['ASSESS', 'IMPLEMENT', 'TEST', 'SECURITY_REVIEW', 'REVIEW'],
    roles: ['dependency-upgrade-specialist', 'test-reviewer'],
    evidence: ['dependency-diff', 'test-results', 'review-result'],
    authoritySensitiveNodes: ['final-review'],
    independenceRequired: true,
  },
  {
    id: 'database-migration',
    intent: 'DATABASE_MIGRATION',
    purpose: 'Design and validate a database migration with rollback and data-integrity evidence.',
    risk: 'HIGH',
    stages: ['PLAN', 'MIGRATION_DESIGN', 'SIMULATE', 'TEST', 'REVIEW'],
    roles: ['database-migration-reviewer', 'test-reviewer'],
    evidence: ['migration-plan', 'rollback-plan', 'simulation-result', 'test-results'],
    authoritySensitiveNodes: ['migration-gate', 'final-review'],
    independenceRequired: true,
  },
  {
    id: 'refactor',
    intent: 'REFACTOR',
    purpose: 'Perform behavior-preserving structural change with regression and review evidence.',
    risk: 'NORMAL',
    stages: ['PLAN', 'IMPLEMENT', 'TEST', 'REVIEW'],
    roles: ['implementation-agent', 'test-reviewer'],
    evidence: ['change-set', 'regression-results', 'review-result'],
    authoritySensitiveNodes: ['final-review'],
    independenceRequired: true,
  },
  {
    id: 'release-preparation',
    intent: 'RELEASE_PREPARATION',
    purpose: 'Assemble release-readiness evidence before any authority-bearing release action.',
    risk: 'HIGH',
    stages: ['ASSESS', 'TEST', 'SECURITY_REVIEW', 'RELEASE_REVIEW'],
    roles: ['test-reviewer', 'security-reviewer', 'release-reviewer'],
    evidence: ['test-results', 'security-review-result', 'release-readiness-report'],
    authoritySensitiveNodes: ['release-gate'],
    independenceRequired: true,
  },
  {
    id: 'hotfix',
    intent: 'HOTFIX',
    purpose: 'Apply an urgent bounded fix while preserving test, review and release gates.',
    risk: 'HIGH',
    stages: ['ASSESS', 'IMPLEMENT', 'TEST', 'REVIEW', 'RELEASE_REVIEW'],
    roles: ['implementation-agent', 'test-reviewer', 'release-reviewer'],
    evidence: ['change-set', 'test-results', 'review-result', 'release-readiness-report'],
    authoritySensitiveNodes: ['final-review', 'release-gate'],
    independenceRequired: true,
  },
  {
    id: 'incident-response',
    intent: 'INCIDENT_RESPONSE',
    purpose:
      'Investigate an incident, preserve evidence and produce bounded remediation candidates.',
    risk: 'HIGH',
    stages: ['TRIAGE', 'INVESTIGATE', 'EVIDENCE', 'REMEDIATE', 'REVIEW'],
    roles: ['incident-investigator', 'implementation-agent', 'test-reviewer'],
    evidence: ['incident-timeline', 'root-cause-evidence', 'remediation-candidate', 'test-results'],
    authoritySensitiveNodes: ['remediation-gate'],
    independenceRequired: true,
  },
  {
    id: 'performance-regression',
    intent: 'PERFORMANCE_REGRESSION',
    purpose:
      'Measure, isolate and repair a performance regression with reproducible benchmark evidence.',
    risk: 'NORMAL',
    stages: ['BASELINE_BENCHMARK', 'INVESTIGATE', 'IMPLEMENT', 'VERIFY_BENCHMARK', 'REVIEW'],
    roles: ['performance-reviewer', 'implementation-agent'],
    evidence: ['baseline-benchmark', 'candidate-benchmark', 'review-result'],
    authoritySensitiveNodes: ['final-review'],
    independenceRequired: true,
  },
  {
    id: 'provider-model-migration',
    intent: 'PROVIDER_MODEL_MIGRATION',
    purpose: 'Evaluate and prepare a provider or model migration without semantic result shopping.',
    risk: 'HIGH',
    stages: ['QUALIFY', 'BENCHMARK', 'SHADOW', 'REVIEW'],
    roles: ['architecture-reviewer', 'test-reviewer'],
    evidence: ['qualification-result', 'benchmark-result', 'shadow-result', 'review-result'],
    authoritySensitiveNodes: ['binding-publication-gate'],
    independenceRequired: true,
  },
  {
    id: 'architecture-change',
    intent: 'ARCHITECTURE_CHANGE',
    purpose:
      'Prepare an architecture change with ADR, implementation, verification and independent review.',
    risk: 'HIGH',
    stages: ['ADR', 'PLAN', 'IMPLEMENT', 'TEST', 'ARCHITECTURE_REVIEW'],
    roles: ['architecture-reviewer', 'implementation-agent', 'test-reviewer'],
    evidence: ['adr', 'change-set', 'test-results', 'architecture-review-result'],
    authoritySensitiveNodes: ['architecture-gate', 'final-review'],
    independenceRequired: true,
  },
];

const CURATED_BLUEPRINTS = Object.freeze(
  DEFINITIONS.map((definition) => publishFhKuikaBlueprintV1(toDraft(definition))),
);

export function getFhKuikaCuratedBlueprintsV1(): readonly FhKuikaPublishedBlueprintV1[] {
  return CURATED_BLUEPRINTS;
}

export function getFhKuikaCuratedBlueprintV1(
  id: string,
  version = '1.0.0',
): FhKuikaPublishedBlueprintV1 | null {
  return (
    CURATED_BLUEPRINTS.find((blueprint) => blueprint.id === id && blueprint.version === version) ??
    null
  );
}

export function curatedBlueprintPackCanGrantAuthority(): false {
  return false;
}

function toDraft(definition: CuratedBlueprintDefinition): FhKuikaBlueprintDraftV1 {
  return {
    schemaVersion: 1,
    id: definition.id,
    version: '1.0.0',
    purpose: definition.purpose,
    compatibleIntents: [definition.intent],
    defaultRiskTier: definition.risk,
    lifecycleStages: definition.stages,
    requiredEvidence: definition.evidence,
    requiredRoles: definition.roles,
    independence: {
      required: definition.independenceRequired,
      minimumDistinctReviewers: definition.independenceRequired ? 1 : 0,
      forbiddenSelfReview: definition.independenceRequired,
    },
    workflowTemplateRef: 'workflow:' + definition.id + '@1.0.0',
    parameters: [
      {
        id: 'scope',
        description: 'Bounded project or change scope for this blueprint.',
        required: true,
        valueType: 'STRING',
      },
    ],
    authoritySensitiveNodes: definition.authoritySensitiveNodes,
    validationRules: [
      'exact-revision-binding',
      'required-evidence-present',
      'authority-cannot-be-weakened',
    ],
    simulationFixtures: [
      {
        id: 'standard-pass',
        description: 'Standard authority-neutral simulation reaches PASS with required evidence.',
        expectedTerminalState: 'PASS',
      },
      {
        id: 'missing-evidence',
        description: 'Missing required evidence fails closed before authority-bearing action.',
        expectedTerminalState: 'BLOCKED',
      },
    ],
    status: 'DRAFT',
    authority: 'NONE',
  };
}
