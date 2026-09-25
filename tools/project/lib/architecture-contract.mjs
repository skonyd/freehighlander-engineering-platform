import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

const REQUIRED_ADRS = Array.from(
  { length: 21 },
  (_, index) => `ADR-${String(index + 1).padStart(4, '0')}`,
);

const REQUIRED_AUTHORITY_LEVELS = [
  'ADVISORY',
  'CANDIDATE',
  'WRITER',
  'ADJUDICATOR',
  'FINAL_REVIEWER',
  'HUMAN_APPROVER',
  'SYSTEM_POLICY',
];

const REQUIRED_NODE_KINDS = [
  'MODEL',
  'COMMAND',
  'GATE',
  'CONDITION',
  'PARALLEL',
  'AGGREGATE',
  'DEBATE',
  'LOOP',
  'HUMAN',
  'SUBWORKFLOW',
];

const REQUIRED_CONTEXTS = [
  'orchestration',
  'governance',
  'model-runtime',
  'evidence',
  'telemetry',
  'persistence',
  'contracts',
  'planning',
  'development',
  'testing',
  'security',
  'release',
  'operations',
  'incident',
  'lineage',
];

export async function loadArchitectureContract(root) {
  const file = path.join(root, '.freehighlander', 'architecture.yaml');
  const parsed = YAML.parse(await fs.readFile(file, 'utf8'));
  assertArchitectureContract(parsed);
  return parsed;
}

export function assertArchitectureContract(contract) {
  if (!isRecord(contract) || contract.schema_version !== 1) {
    throw new Error('architecture schema_version must be 1');
  }
  if (
    typeof contract.contract_version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(contract.contract_version)
  ) {
    throw new Error('architecture contract_version must be semantic version');
  }
  expect(contract.contract_version, '1.9.0', 'architecture contract version');
  expect(contract.status, 'FROZEN_BASELINE', 'architecture status');
  expect(contract.phase, 'FH-10', 'architecture phase');

  expectTrue(
    contract.change_policy?.semantic_change_requires_adr,
    'semantic architecture change requires ADR',
  );
  expectTrue(
    contract.change_policy?.semantic_change_requires_version_bump,
    'semantic architecture change requires contract version bump',
  );
  expectTrue(
    contract.change_policy?.published_contract_is_immutable,
    'published architecture contract is immutable',
  );

  assertContainsExactly(contract.accepted_adrs, REQUIRED_ADRS, 'accepted ADRs');
  assertContainsExactly(contract.bounded_contexts?.packages, REQUIRED_CONTEXTS, 'bounded contexts');
  assertIncludes(
    contract.bounded_contexts?.forbidden,
    'packages/core',
    'forbidden package boundaries',
  );

  assertContainsExactly(contract.authority?.levels, REQUIRED_AUTHORITY_LEVELS, 'authority levels');
  expect(contract.authority?.human_approver_principal, 'HUMAN', 'human approver principal');
  expect(contract.authority?.system_policy_principal, 'SYSTEM', 'system policy principal');
  expectTrue(
    contract.authority?.producer_must_not_be_final_approver,
    'producer must not be final approver',
  );
  expectTrue(contract.authority?.unknown_gate_fails_closed, 'unknown gate fails closed');
  expectTrue(
    contract.authority?.semantic_negative_cannot_be_bypassed_by_fallback,
    'semantic negative cannot be bypassed by fallback',
  );

  expect(contract.providers?.core_contract, 'ProviderAdapter', 'provider core contract');
  expectTrue(
    contract.providers?.capability_registry_required,
    'provider capability registry is required',
  );
  expect(contract.providers?.fallback_policy, 'availability-only', 'provider fallback policy');
  assertContainsExactly(
    contract.providers?.fallback_availability_classes,
    [
      'quota_exhausted',
      'rate_limited',
      'auth_unavailable',
      'provider_unavailable',
      'transport_failure',
    ],
    'availability fallback classes',
  );
  assertContainsExactly(
    contract.providers?.fallback_forbidden_classes,
    ['semantic_failure', 'malformed_output'],
    'forbidden fallback classes',
  );
  expectTrue(
    contract.providers?.health_is_separate_from_semantic_quality,
    'provider health must stay separate from semantic quality',
  );

  expect(contract.roles?.identity, 'logical-role', 'role identity');
  expect(contract.roles?.unknown_tool_permission, 'DENY', 'unknown tool permission');
  expectTrue(contract.roles?.run_version_pinning, 'role version pinning');

  assertContainsExactly(contract.workflows?.node_kinds, REQUIRED_NODE_KINDS, 'workflow node kinds');
  expectTrue(contract.workflows?.publish_immutable, 'published workflow is immutable');
  expectTrue(contract.workflows?.run_snapshot_required, 'workflow run snapshot is required');
  expectTrue(contract.workflows?.loops_must_be_bounded, 'workflow loops must be bounded');

  expectTrue(contract.debate?.independent_round_zero, 'debate round zero is independent');
  expectTrue(contract.debate?.bounded_rounds, 'debate rounds are bounded');
  expectTrue(contract.debate?.consensus_is_not_authority, 'debate consensus is not authority');

  expectTrue(
    contract.evidence?.exact_revision_binding_required,
    'exact revision binding is required',
  );
  expectTrue(
    contract.evidence?.trusted_provenance_required_for_authority,
    'trusted provenance is required for authority',
  );

  expectTrue(contract.telemetry?.append_only_events, 'telemetry is append-only');
  expect(contract.telemetry?.query_projection, 'SQLite', 'telemetry query projection');

  expect(contract.security?.execution_default, 'DENY', 'execution default');
  expect(contract.security?.network_default, 'DENY', 'network default');
  expect(contract.security?.secret_remote_egress, 'DENY', 'secret remote egress');
  expect(contract.security?.repository_plaintext_secrets, 'DENY', 'repository plaintext secrets');

  expectFalse(contract.evaluation?.automatic_authority_promotion, 'automatic authority promotion');
  expectFalse(
    contract.evaluation?.required_evidence_may_be_truncated_for_budget,
    'required evidence truncation for budget',
  );
  expectFalse(
    contract.evaluation?.semantic_model_shopping_after_verdict,
    'semantic model shopping after verdict',
  );

  expect(contract.migration?.v2_reference_status, 'ACCEPTED', 'V2 reference status');
  expect(
    contract.migration?.v2_reference_sha,
    '1a8e215b78a3a5008aae6aae36488b3273733b19',
    'V2 accepted reference SHA',
  );
  expect(
    contract.migration?.v2_reference_merge_sha,
    'e4707a3c4267db9d2aadd452782b91045b96724d',
    'V2 #207 merge SHA',
  );
  expect(contract.migration?.v2_reference_post_merge_hardening_pr, 209, 'V2 hardening PR');
  expect(
    contract.migration?.v2_compatibility_authority,
    'ENABLED',
    'V2 compatibility authority',
  );
  expect(
    contract.migration?.fh01b2_dependency_status,
    'SATISFIED',
    'FH-01B2 dependency status',
  );
  expect(contract.migration?.v3_authority, 'SHADOW_ONLY', 'V3 authority');
  expect(contract.migration?.v3_authority_cutover_phase, 'FH-20', 'V3 authority cutover phase');

  expectTrue(contract.ui?.web_is_client_only, 'web is client only');
  expectTrue(
    contract.ui?.workflow_execution_survives_ui_disconnect,
    'workflow execution survives UI disconnect',
  );
}

export function architectureContractHash(contract) {
  assertArchitectureContract(contract);
  return createHash('sha256').update(canonicalJson(contract), 'utf8').digest('hex');
}

function expect(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
}

function expectTrue(actual, label) {
  if (actual !== true) throw new Error(`${label} must be true`);
}

function expectFalse(actual, label) {
  if (actual !== false) throw new Error(`${label} must be false`);
}

function assertIncludes(actual, expected, label) {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    throw new Error(`${label} must include ${expected}`);
  }
}

function assertContainsExactly(actual, expected, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} must be an array`);
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(`${label} do not match frozen baseline`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
