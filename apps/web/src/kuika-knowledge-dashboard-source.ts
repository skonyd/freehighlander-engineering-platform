import type { DashboardReadModel } from './read-model.js';
import type { FhKuikaKnowledgeLineageSourceV1 } from './kuika-knowledge-retriever.js';
import type { FhKuikaKnowledgeResultV1 } from './kuika-knowledge-contract.js';

export function createFhKuikaDashboardKnowledgeSourceV1(
  readModel: DashboardReadModel,
): FhKuikaKnowledgeLineageSourceV1 {
  return {
    exactEntity(entityId) {
      const results: FhKuikaKnowledgeResultV1[] = [];
      for (const run of readModel.listRuns(100)) {
        for (const artifact of readModel.listArtifacts(run.runId, 1000)) {
          if (artifact.artifactId !== entityId) continue;
          results.push({
            id: 'artifact:' + artifact.artifactId,
            label: artifact.artifactId,
            resultClass: 'AUTHORITATIVE',
            provenance: {
              sourceKind: 'ARTIFACT',
              sourceId: artifact.artifactId,
              ...(run.repository &&
              run.headSha &&
              /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(run.headSha)
                ? { revision: { repository: run.repository, sha: run.headSha } }
                : {}),
              evidenceIds: [artifact.artifactId],
            },
            authority: 'NONE',
          });
        }
      }
      return results;
    },

    exactRevision(repository, sha) {
      return readModel
        .listRuns(100)
        .filter((run) => run.repository === repository && run.headSha === sha)
        .map((run): FhKuikaKnowledgeResultV1 => ({
          id: 'revision:' + run.runId,
          label: (run.workflowId ?? 'run') + ' · ' + run.runId,
          resultClass: 'AUTHORITATIVE',
          provenance: {
            sourceKind: 'LINEAGE_ENTITY',
            sourceId: 'run:' + run.runId,
            revision: { repository, sha },
            evidenceIds: [],
          },
          authority: 'NONE',
        }));
    },

    traverseAuthoritative() {
      return [];
    },

    evidenceForResults(results) {
      const evidenceIds = new Set<string>();
      for (const result of results) {
        for (const evidenceId of result.provenance.evidenceIds) evidenceIds.add(evidenceId);
      }

      return [...evidenceIds].sort().map((evidenceId): FhKuikaKnowledgeResultV1 => ({
        id: 'evidence:' + evidenceId,
        label: evidenceId,
        resultClass: 'AUTHORITATIVE',
        provenance: {
          sourceKind: 'EVIDENCE',
          sourceId: evidenceId,
          evidenceIds: [evidenceId],
        },
        authority: 'NONE',
      }));
    },
  };
}

export function dashboardKnowledgeSourceCanInvokeModel(): false {
  return false;
}

export function dashboardKnowledgeSourceCanGrantAuthority(): false {
  return false;
}

export function dashboardKnowledgeSourceCanInventLineage(): false {
  return false;
}
