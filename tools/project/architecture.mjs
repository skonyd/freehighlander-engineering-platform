import { architectureContractHash, loadArchitectureContract } from './lib/architecture-contract.mjs';
import { findRepoRoot } from './lib/state.mjs';

const root = await findRepoRoot();
const contract = await loadArchitectureContract(root);

console.log(`status=${contract.status}`);
console.log(`contract_version=${contract.contract_version}`);
console.log(`hash=${architectureContractHash(contract)}`);
console.log(`accepted_adrs=${contract.accepted_adrs.length}`);
console.log(`provider_fallback=${contract.providers.fallback_policy}`);
console.log(`v3_authority=${contract.migration.v3_authority}`);
console.log(`cutover_phase=${contract.migration.v3_authority_cutover_phase}`);
