import { sha256Text } from './context-packet.js';

export interface StablePromptInput {
  readonly prefixVersion: string;
  readonly systemAndRoleContract: string;
  readonly toolDefinitions?: string;
  readonly repositoryContract: string;
  readonly taskSpecificEvidence?: string;
  readonly volatileUserRequest: string;
}

export interface PromptSection {
  readonly id: string;
  readonly content: string;
}

export interface PromptCacheHint {
  readonly prefixVersion: string;
  readonly stablePrefixHash: string;
  readonly stablePrefixBytes: number;
  readonly cacheHitAssumed: false;
}

export interface PromptAssembly {
  readonly stableSections: readonly PromptSection[];
  readonly dynamicSections: readonly PromptSection[];
  readonly stablePrefix: string;
  readonly dynamicSuffix: string;
  readonly input: string;
  readonly stablePrefixHash: string;
  readonly dynamicHash: string;
  readonly cacheHint: PromptCacheHint;
}

export function buildStablePrompt(input: StablePromptInput): PromptAssembly {
  requireText(input.prefixVersion, 'prefixVersion');
  requireText(input.systemAndRoleContract, 'systemAndRoleContract');
  requireText(input.repositoryContract, 'repositoryContract');
  requireText(input.volatileUserRequest, 'volatileUserRequest');

  const stableSections: PromptSection[] = [
    {
      id: 'stable_system_and_role_contract',
      content: input.systemAndRoleContract,
    },
  ];

  if (input.toolDefinitions?.trim()) {
    stableSections.push({
      id: 'stable_tool_definitions',
      content: input.toolDefinitions,
    });
  }

  stableSections.push({
    id: 'stable_repository_contract',
    content: input.repositoryContract,
  });

  const dynamicSections: PromptSection[] = [];
  if (input.taskSpecificEvidence?.trim()) {
    dynamicSections.push({
      id: 'task_specific_evidence',
      content: input.taskSpecificEvidence,
    });
  }
  dynamicSections.push({
    id: 'volatile_user_request',
    content: input.volatileUserRequest,
  });

  const stablePrefix = renderSections(stableSections);
  const dynamicSuffix = renderSections(dynamicSections);
  const stablePrefixHash = sha256Text(stablePrefix);

  return {
    stableSections,
    dynamicSections,
    stablePrefix,
    dynamicSuffix,
    input: `${stablePrefix}\n\n${dynamicSuffix}`,
    stablePrefixHash,
    dynamicHash: sha256Text(dynamicSuffix),
    cacheHint: {
      prefixVersion: input.prefixVersion,
      stablePrefixHash,
      stablePrefixBytes: Buffer.byteLength(stablePrefix, 'utf8'),
      cacheHitAssumed: false,
    },
  };
}

function renderSections(sections: readonly PromptSection[]): string {
  return sections
    .map((section) => `<${section.id}>\n${section.content}\n</${section.id}>`)
    .join('\n\n');
}

function requireText(value: string, name: string): void {
  if (!value.trim()) {
    throw new Error(`${name} is required`);
  }
}
