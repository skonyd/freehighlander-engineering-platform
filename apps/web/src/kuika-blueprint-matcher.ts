import type {
  FhKuikaBlueprintIntent,
  FhKuikaBlueprintRiskTier,
  FhKuikaPublishedBlueprintV1,
} from './kuika-blueprint.js';

export interface FhKuikaBlueprintMatchRequestV1 {
  readonly intent: FhKuikaBlueprintIntent;
  readonly requestedRiskTier: FhKuikaBlueprintRiskTier;
  readonly desiredLifecycleStages?: readonly string[];
  readonly knownRoleIds?: readonly string[];
  readonly knownEvidenceKinds?: readonly string[];
}

export interface FhKuikaBlueprintMatchEvidenceV1 {
  readonly rule:
    | 'INTENT_COMPATIBLE'
    | 'RISK_EXACT'
    | 'RISK_ESCALATED'
    | 'INDEPENDENCE_ALIGNED'
    | 'LIFECYCLE_STAGE_MATCH'
    | 'ROLE_AVAILABLE'
    | 'ROLE_MISSING'
    | 'EVIDENCE_AVAILABLE'
    | 'EVIDENCE_MISSING';
  readonly passed: boolean;
  readonly detail: string;
  readonly scoreDelta: number;
}

export interface FhKuikaBlueprintMatchCandidateV1 {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly blueprintHash: string;
  readonly eligible: boolean;
  readonly score: number;
  readonly effectiveRiskTier: FhKuikaBlueprintRiskTier;
  readonly evidence: readonly FhKuikaBlueprintMatchEvidenceV1[];
  readonly authority: 'NONE';
}

const RISK_WEIGHT: Record<FhKuikaBlueprintRiskTier, number> = {
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export function matchFhKuikaBlueprintsV1(
  request: FhKuikaBlueprintMatchRequestV1,
  blueprints: readonly FhKuikaPublishedBlueprintV1[],
): readonly FhKuikaBlueprintMatchCandidateV1[] {
  const desiredStages = normalizeOptionalSet(request.desiredLifecycleStages);
  const knownRoles = normalizeOptionalSet(request.knownRoleIds);
  const knownEvidence = normalizeOptionalSet(request.knownEvidenceKinds);

  return blueprints
    .map((blueprint) =>
      matchOneBlueprint(request, blueprint, {
        desiredStages,
        knownRoles,
        knownEvidence,
      }),
    )
    .sort(compareCandidates);
}

export function blueprintMatcherCanGrantAuthority(): false {
  return false;
}

export function blueprintMatcherCanLowerRisk(): false {
  return false;
}

function matchOneBlueprint(
  request: FhKuikaBlueprintMatchRequestV1,
  blueprint: FhKuikaPublishedBlueprintV1,
  context: {
    readonly desiredStages: ReadonlySet<string> | null;
    readonly knownRoles: ReadonlySet<string> | null;
    readonly knownEvidence: ReadonlySet<string> | null;
  },
): FhKuikaBlueprintMatchCandidateV1 {
  const evidence: FhKuikaBlueprintMatchEvidenceV1[] = [];
  let eligible = true;
  let score = 0;

  const intentCompatible = blueprint.compatibleIntents.includes(request.intent);
  evidence.push({
    rule: 'INTENT_COMPATIBLE',
    passed: intentCompatible,
    detail: intentCompatible
      ? 'Blueprint explicitly supports requested intent ' + request.intent + '.'
      : 'Blueprint does not support requested intent ' + request.intent + '.',
    scoreDelta: intentCompatible ? 100 : 0,
  });
  if (!intentCompatible) eligible = false;
  score += intentCompatible ? 100 : 0;

  const effectiveRiskTier = maxRisk(request.requestedRiskTier, blueprint.defaultRiskTier);
  const riskExact = request.requestedRiskTier === blueprint.defaultRiskTier;
  evidence.push({
    rule: riskExact ? 'RISK_EXACT' : 'RISK_ESCALATED',
    passed: true,
    detail: riskExact
      ? 'Blueprint default risk matches requested risk.'
      : 'Effective risk is ' +
        effectiveRiskTier +
        '; matcher never lowers requested or blueprint default risk.',
    scoreDelta: riskExact ? 20 : 0,
  });
  score += riskExact ? 20 : 0;

  if (
    (effectiveRiskTier === 'HIGH' || effectiveRiskTier === 'CRITICAL') &&
    blueprint.independence.required &&
    blueprint.independence.forbiddenSelfReview
  ) {
    evidence.push({
      rule: 'INDEPENDENCE_ALIGNED',
      passed: true,
      detail: 'High-impact candidate requires independent review and forbids self review.',
      scoreDelta: 10,
    });
    score += 10;
  }

  if (context.desiredStages) {
    for (const stage of context.desiredStages) {
      const matched = blueprint.lifecycleStages.includes(stage);
      evidence.push({
        rule: 'LIFECYCLE_STAGE_MATCH',
        passed: matched,
        detail: matched
          ? 'Blueprint includes desired lifecycle stage ' + stage + '.'
          : 'Blueprint does not include desired lifecycle stage ' + stage + '.',
        scoreDelta: matched ? 2 : 0,
      });
      score += matched ? 2 : 0;
    }
  }

  if (context.knownRoles) {
    for (const role of blueprint.requiredRoles) {
      const available = context.knownRoles.has(role);
      evidence.push({
        rule: available ? 'ROLE_AVAILABLE' : 'ROLE_MISSING',
        passed: available,
        detail: available
          ? 'Required role is available: ' + role + '.'
          : 'Required role is not available: ' + role + '.',
        scoreDelta: available ? 1 : 0,
      });
      score += available ? 1 : 0;
      if (!available) eligible = false;
    }
  }

  if (context.knownEvidence) {
    for (const evidenceKind of blueprint.requiredEvidence) {
      const available = context.knownEvidence.has(evidenceKind);
      evidence.push({
        rule: available ? 'EVIDENCE_AVAILABLE' : 'EVIDENCE_MISSING',
        passed: available,
        detail: available
          ? 'Required evidence capability is available: ' + evidenceKind + '.'
          : 'Required evidence capability is not available: ' + evidenceKind + '.',
        scoreDelta: available ? 1 : 0,
      });
      score += available ? 1 : 0;
      if (!available) eligible = false;
    }
  }

  return {
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintHash: blueprint.blueprintHash,
    eligible,
    score,
    effectiveRiskTier,
    evidence,
    authority: 'NONE',
  };
}

function compareCandidates(
  left: FhKuikaBlueprintMatchCandidateV1,
  right: FhKuikaBlueprintMatchCandidateV1,
): number {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  const id = left.blueprintId.localeCompare(right.blueprintId);
  if (id !== 0) return id;
  return compareSemverDesc(left.blueprintVersion, right.blueprintVersion);
}

function compareSemverDesc(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function maxRisk(
  left: FhKuikaBlueprintRiskTier,
  right: FhKuikaBlueprintRiskTier,
): FhKuikaBlueprintRiskTier {
  return RISK_WEIGHT[left] >= RISK_WEIGHT[right] ? left : right;
}

function normalizeOptionalSet(values: readonly string[] | undefined): ReadonlySet<string> | null {
  if (values === undefined) return null;
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}
