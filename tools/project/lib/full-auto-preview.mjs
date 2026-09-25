import {
  buildFullAutoReviewerBindingSnapshot,
  validateRoleBindingPublicationV1,
} from '../../../packages/model-runtime/dist/index.js';
import {
  fullAutoProfileCanDelegateRisk,
  modelQuorumCanOverrideDeny,
  modelQuorumCanSatisfyHumanRequired,
} from '../../../packages/governance/dist/index.js';

const PROFILES = new Set(['OFF', 'SAFE', 'BALANCED', 'CUSTOM']);
const RISK_TIERS = new Set(['NORMAL', 'HIGH', 'CRITICAL']);

export function buildFullAutoConfigurationPreview(state, input) {
  const profile = requireEnum(input.profile ?? 'OFF', PROFILES, 'profile');
  const riskTier = requireEnum(input.riskTier ?? 'NORMAL', RISK_TIERS, 'riskTier');
  const reviewerARole = requireId(
    input.reviewerARole ?? 'autonomous-merge-reviewer-a',
    'reviewerARole',
  );
  const reviewerBRole = requireId(
    input.reviewerBRole ?? 'autonomous-merge-reviewer-b',
    'reviewerBRole',
  );
  const producerIndependenceGroup = requireId(
    input.producerIndependenceGroup,
    'producerIndependenceGroup',
  );
  const maxDebateRounds = normalizeMaxDebateRounds(input.maxDebateRounds ?? 2);
  const customAllowedRiskTiers = normalizeCustomRiskTiers(input.customAllowedRiskTiers ?? []);

  const configuration = {
    profile,
    ...(profile === 'CUSTOM' ? { customAllowedRiskTiers } : {}),
  };
  const riskDelegated = fullAutoProfileCanDelegateRisk(configuration, riskTier);
  const blockingReasons = [];

  if (profile === 'OFF') blockingReasons.push('PROFILE_OFF');
  else if (!riskDelegated) blockingReasons.push('RISK_NOT_DELEGATED');

  if (reviewerARole === reviewerBRole) {
    blockingReasons.push('REVIEWER_ROLES_NOT_DISTINCT');
  }

  const reviewerA = findPublication(state, reviewerARole, riskTier);
  const reviewerB = findPublication(state, reviewerBRole, riskTier);

  if (reviewerA === null) blockingReasons.push('REVIEWER_A_BINDING_MISSING');
  if (reviewerB === null) blockingReasons.push('REVIEWER_B_BINDING_MISSING');

  let bindingSnapshot = null;
  let independence = {
    valid: false,
    reason: reviewerA === null || reviewerB === null ? 'BINDING_MISSING' : 'NOT_EVALUATED',
  };

  if (reviewerA !== null && reviewerB !== null && reviewerARole !== reviewerBRole) {
    try {
      bindingSnapshot = buildFullAutoReviewerBindingSnapshot({
        reviewerA: reviewerA.plan,
        reviewerB: reviewerB.plan,
        producerIndependenceGroup,
      });
      independence = { valid: true, reason: 'VALID' };
    } catch (error) {
      blockingReasons.push('INDEPENDENCE_INVALID');
      independence = {
        valid: false,
        reason: error instanceof Error ? error.message : 'unknown independence validation error',
      };
    }
  }

  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const configurationStatus =
    uniqueBlockingReasons.length === 0 ? 'READY_FOR_SHADOW_REVIEW' : 'BLOCKED';

  return {
    schemaVersion: 1,
    configurationStatus,
    blockingReasons: uniqueBlockingReasons,
    profile,
    riskTier,
    riskDelegated,
    maxDebateRounds,
    reviewerA: reviewerSummary(reviewerA, reviewerARole),
    reviewerB: reviewerSummary(reviewerB, reviewerBRole),
    independence,
    bindingSnapshot,
    policyBoundary: {
      humanRequiredDelegable: modelQuorumCanSatisfyHumanRequired(),
      denyOverridable: modelQuorumCanOverrideDeny(),
      systemPolicyRequired: true,
    },
    authority: {
      v3: 'SHADOW_ONLY',
      mergeExecution: 'SHADOW_ONLY',
      executionAuthorized: false,
    },
    runPreview: {
      wouldAutonomouslyMergeNow: false,
      reason:
        configurationStatus === 'READY_FOR_SHADOW_REVIEW'
          ? 'NO_CURRENT_RUN_EVIDENCE'
          : 'CONFIGURATION_BLOCKED',
    },
  };
}

function findPublication(state, logicalRole, riskTier) {
  if (!state || !Array.isArray(state.publications)) {
    throw new Error('model management state publications are required');
  }

  const matches = state.publications.filter(
    (publication) =>
      publication.logicalRole === logicalRole && publication.riskTier === riskTier,
  );
  if (matches.length > 1) {
    throw new Error(`multiple binding publications found for ${logicalRole}/${riskTier}`);
  }
  if (matches.length === 0) return null;

  validateRoleBindingPublicationV1(matches[0]);
  return matches[0];
}

function reviewerSummary(publication, requestedRole) {
  if (publication === null) {
    return {
      logicalRole: requestedRole,
      configured: false,
      publicationHash: null,
      planHash: null,
      primary: null,
      fallbacks: [],
    };
  }

  return {
    logicalRole: publication.logicalRole,
    configured: true,
    publicationHash: publication.hash,
    planHash: publication.plan.hash,
    primary: {
      bindingId: publication.primary.id,
      providerId: publication.primary.providerId,
      model: publication.primary.model,
      effort: publication.primary.effort ?? null,
      independenceGroup: publication.primary.independenceGroup,
    },
    fallbacks: publication.fallbacks.map((binding) => ({
      bindingId: binding.id,
      providerId: binding.providerId,
      model: binding.model,
      effort: binding.effort ?? null,
      independenceGroup: binding.independenceGroup,
    })),
  };
}

function normalizeMaxDebateRounds(value) {
  const normalized = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 10) {
    throw new Error('maxDebateRounds must be an integer between 1 and 10');
  }
  return normalized;
}

function normalizeCustomRiskTiers(values) {
  const normalized = Array.isArray(values) ? values : [values];
  return [...new Set(normalized.map((value) => requireEnum(value, RISK_TIERS, 'customRiskTier')))]
    .sort();
}

function requireEnum(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function requireId(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}
