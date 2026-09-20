import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  architectureContractHash,
  assertArchitectureContract,
  loadArchitectureContract,
} from '../lib/architecture-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('repository V3 architecture contract validates and hashes deterministically', async () => {
  const contract = await loadArchitectureContract(root);
  const first = architectureContractHash(contract);
  const second = architectureContractHash(structuredClone(contract));

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.equal(contract.contract_version, '1.7.0');
  assert.equal(contract.status, 'FROZEN_BASELINE');
  assert.equal(contract.bounded_contexts.packages.includes('planning'), true);
  assert.equal(contract.bounded_contexts.packages.includes('development'), true);
  assert.equal(contract.bounded_contexts.packages.includes('testing'), true);
  assert.equal(contract.bounded_contexts.packages.includes('security'), true);
  assert.equal(contract.bounded_contexts.packages.includes('release'), true);
  assert.equal(contract.bounded_contexts.packages.includes('operations'), true);
  assert.equal(contract.bounded_contexts.packages.includes('incident'), true);
  assert.equal(contract.migration.v3_authority, 'SHADOW_ONLY');
});

test('architecture freeze rejects authority cutover before FH-20', async () => {
  const contract = structuredClone(await loadArchitectureContract(root));
  contract.migration.v3_authority = 'ENABLED';

  assert.throws(() => assertArchitectureContract(contract), /V3 authority must be SHADOW_ONLY/);
});

test('architecture freeze rejects semantic fallback/model-shopping drift', async () => {
  const contract = structuredClone(await loadArchitectureContract(root));
  contract.providers.fallback_policy = 'semantic-retry';

  assert.throws(() => assertArchitectureContract(contract), /provider fallback policy/);
});

test('architecture freeze rejects permissive unknown tool permissions', async () => {
  const contract = structuredClone(await loadArchitectureContract(root));
  contract.roles.unknown_tool_permission = 'ALLOW';

  assert.throws(() => assertArchitectureContract(contract), /unknown tool permission must be DENY/);
});

test('architecture freeze rejects missing accepted ADRs, module contexts and unbounded loops', async () => {
  const missingAdr = structuredClone(await loadArchitectureContract(root));
  missingAdr.accepted_adrs.pop();
  assert.throws(() => assertArchitectureContract(missingAdr), /accepted ADRs/);

  const missingPlanning = structuredClone(await loadArchitectureContract(root));
  missingPlanning.bounded_contexts.packages = missingPlanning.bounded_contexts.packages.filter(
    (entry) => entry !== 'planning',
  );
  assert.throws(() => assertArchitectureContract(missingPlanning), /bounded contexts/);

  const missingDevelopment = structuredClone(await loadArchitectureContract(root));
  missingDevelopment.bounded_contexts.packages =
    missingDevelopment.bounded_contexts.packages.filter((entry) => entry !== 'development');
  assert.throws(() => assertArchitectureContract(missingDevelopment), /bounded contexts/);

  const missingTesting = structuredClone(await loadArchitectureContract(root));
  missingTesting.bounded_contexts.packages = missingTesting.bounded_contexts.packages.filter(
    (entry) => entry !== 'testing',
  );
  assert.throws(() => assertArchitectureContract(missingTesting), /bounded contexts/);

  const missingSecurity = structuredClone(await loadArchitectureContract(root));
  missingSecurity.bounded_contexts.packages = missingSecurity.bounded_contexts.packages.filter(
    (entry) => entry !== 'security',
  );
  assert.throws(() => assertArchitectureContract(missingSecurity), /bounded contexts/);

  const missingRelease = structuredClone(await loadArchitectureContract(root));
  missingRelease.bounded_contexts.packages = missingRelease.bounded_contexts.packages.filter(
    (entry) => entry !== 'release',
  );
  assert.throws(() => assertArchitectureContract(missingRelease), /bounded contexts/);

  const missingOperations = structuredClone(await loadArchitectureContract(root));
  missingOperations.bounded_contexts.packages = missingOperations.bounded_contexts.packages.filter(
    (entry) => entry !== 'operations',
  );
  assert.throws(() => assertArchitectureContract(missingOperations), /bounded contexts/);

  const missingIncident = structuredClone(await loadArchitectureContract(root));
  missingIncident.bounded_contexts.packages = missingIncident.bounded_contexts.packages.filter(
    (entry) => entry !== 'incident',
  );
  assert.throws(() => assertArchitectureContract(missingIncident), /bounded contexts/);

  const unbounded = structuredClone(await loadArchitectureContract(root));
  unbounded.workflows.loops_must_be_bounded = false;
  assert.throws(() => assertArchitectureContract(unbounded), /workflow loops must be bounded/);
});

test('architecture freeze rejects weakened sandbox or automatic authority promotion', async () => {
  const permissiveNetwork = structuredClone(await loadArchitectureContract(root));
  permissiveNetwork.security.network_default = 'ALLOW';
  assert.throws(
    () => assertArchitectureContract(permissiveNetwork),
    /network default must be DENY/,
  );

  const autoPromotion = structuredClone(await loadArchitectureContract(root));
  autoPromotion.evaluation.automatic_authority_promotion = true;
  assert.throws(
    () => assertArchitectureContract(autoPromotion),
    /automatic authority promotion must be false/,
  );
});
