import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFhKuikaAreaHtml } from './kuika-area-ui.js';
import { FH_KUIKA_BLUEPRINTS_HTML } from './kuika-blueprint-ui.js';
import {
  getFhKuikaCuratedBlueprintV1,
  getFhKuikaCuratedBlueprintsV1,
} from './kuika-blueprint-catalog.js';
import {
  createFhKuikaBlueprintWorkflowDraftV1,
  simulateFhKuikaBlueprintV1,
} from './kuika-blueprint-draft.js';
import {
  buildFhKuikaBlueprintCatalogViewV1,
  buildFhKuikaBlueprintDetailViewV1,
} from './kuika-blueprint-view.js';
import { FH_KUIKA_MODULE_HTML } from './kuika-module-ui.js';
import { FH_KUIKA_WORKBENCH_HTML } from './kuika-workbench-ui.js';
import { FH_KUIKA_ROLE_MARKETPLACE_HTML } from './kuika-role-marketplace-ui.js';
import {
  buildFhKuikaSolutionPackInstallPlanV1,
  getFhKuikaMarketplaceRoleV1,
  getFhKuikaSolutionPackV1,
  listFhKuikaMarketplaceRolesV1,
  listFhKuikaSolutionPacksV1,
} from './kuika-role-marketplace.js';
import { FH_KUIKA_WORKFLOW_STUDIO_HTML } from './kuika-workflow-ui.js';
import { validateFhKuikaWorkflowDraftDefinitionV1 } from './kuika-workflow-draft.js';
import { simulateFhKuikaWorkflowDraftV1 } from './kuika-workflow-simulation.js';
import { buildFhKuikaWorkflowVersionDiffV1 } from './kuika-workflow-diff.js';
import { buildFhKuikaWorkbenchSnapshotV1, type FhKuikaWorkbenchMode } from './kuika-workbench.js';
import { FH_KUIKA_OPERATIONS_HTML } from './kuika-operations-ui.js';
import { FH_KUIKA_APPROVALS_HTML } from './kuika-approval-ui.js';
import { buildFhKuikaApprovalInboxV1 } from './kuika-approval-inbox.js';
import { FH_KUIKA_CONNECTOR_HUB_HTML } from './kuika-connector-ui.js';
import {
  getFhKuikaConnectorCatalogItemV1,
  listFhKuikaConnectorCatalogV1,
} from './kuika-connector-catalog.js';
import { buildFhKuikaConnectorInstallReviewV1 } from './kuika-connector-install-review.js';
import { DASHBOARD_HTML } from './ui.js';
import {
  createGithubExternalStatusProviderFromEnv,
  type ExternalStatusProvider,
} from './external-status.js';
import { buildManagementSnapshot } from './management.js';
import { buildOperationsConsoleSnapshot } from './operations-console.js';
import { buildFhKuikaRunDetailV1 } from './kuika-run-detail.js';
import { DashboardReadModel, MissingDashboardDatabaseError } from './read-model.js';

export interface DashboardServerOptions {
  readonly databasePath?: string;
  readonly externalStatusProvider?: ExternalStatusProvider;
}

export interface StartedDashboardServer {
  readonly url: string;
  close(): Promise<void>;
}

export function createDashboardServer(options: DashboardServerOptions = {}) {
  const databasePath =
    options.databasePath ??
    process.env.FREEHIGHLANDER_DB ??
    path.resolve(process.cwd(), '.freehighlander', 'runtime', 'freehighlander.sqlite');
  const readModel = new DashboardReadModel(databasePath);
  const externalStatusProvider =
    options.externalStatusProvider ?? createGithubExternalStatusProviderFromEnv();

  return createServer((request, response) => {
    void handleRequest(request, response, readModel, databasePath, externalStatusProvider);
  });
}

export async function startDashboardServer(
  options: DashboardServerOptions & { readonly host?: string; readonly port?: number } = {},
): Promise<StartedDashboardServer> {
  const host = options.host ?? process.env.FREEHIGHLANDER_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.FREEHIGHLANDER_PORT ?? 4310);
  const server = createDashboardServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('dashboard server address unavailable');

  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  readModel: DashboardReadModel,
  databasePath: string,
  externalStatusProvider: ExternalStatusProvider,
): Promise<void> {
  try {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      json(response, 405, { error: 'read_only_dashboard', allowed: ['GET', 'HEAD'] });
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/') {
      html(response, method === 'HEAD' ? '' : DASHBOARD_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika' || url.pathname === '/modules/fh-kuika/') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_MODULE_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/workbench') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_WORKBENCH_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/operate') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_OPERATIONS_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/approvals') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_APPROVALS_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/build') {
      html(response, method === 'HEAD' ? '' : renderFhKuikaAreaHtml('BUILD'));
      return;
    }

    if (url.pathname === '/modules/fh-kuika/integrate/connectors') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_CONNECTOR_HUB_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/build/roles') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_ROLE_MARKETPLACE_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/build/workflows') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_WORKFLOW_STUDIO_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/build/blueprints') {
      html(response, method === 'HEAD' ? '' : FH_KUIKA_BLUEPRINTS_HTML);
      return;
    }

    if (url.pathname === '/modules/fh-kuika/integrate') {
      html(response, method === 'HEAD' ? '' : renderFhKuikaAreaHtml('INTEGRATE'));
      return;
    }

    if (url.pathname === '/modules/fh-kuika/knowledge') {
      html(response, method === 'HEAD' ? '' : renderFhKuikaAreaHtml('KNOWLEDGE'));
      return;
    }

    if (url.pathname === '/api/health') {
      const health = readModel.health();
      json(response, 200, {
        status: health.databaseExists ? 'ok' : 'waiting_for_database',
        mode: 'read-only',
        databasePath,
        ...health,
      });
      return;
    }

    if (url.pathname === '/api/home') {
      json(response, 200, readModel.homeSnapshot());
      return;
    }

    if (url.pathname === '/api/external-status') {
      const health = readModel.health();
      const latestRun = health.databaseExists ? (readModel.listRuns(1)[0] ?? null) : null;
      json(
        response,
        200,
        await externalStatusProvider.read({
          repository: latestRun?.repository ?? null,
          exactRevision: latestRun?.headSha ?? null,
          pullRequest: latestRun?.pullRequest ?? null,
        }),
      );
      return;
    }

    if (url.pathname === '/api/summary') {
      json(response, 200, readModel.summary());
      return;
    }

    if (url.pathname === '/api/runs') {
      json(response, 200, { runs: readModel.listRuns(readLimit(url, 100)) });
      return;
    }

    if (url.pathname === '/api/models') {
      json(response, 200, { models: readModel.modelAggregates(readLimit(url, 100)) });
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/blueprints') {
      json(response, 200, buildFhKuikaBlueprintCatalogViewV1(getFhKuikaCuratedBlueprintsV1()));
      return;
    }

    const blueprintRoute = parseFhKuikaBlueprintRoute(url.pathname);
    if (blueprintRoute) {
      const blueprint = getFhKuikaCuratedBlueprintV1(blueprintRoute.blueprintId);
      if (!blueprint) {
        json(response, 404, {
          error: 'blueprint_not_found',
          blueprintId: blueprintRoute.blueprintId,
        });
        return;
      }
      if (blueprintRoute.resource === 'draft') {
        json(response, 200, createFhKuikaBlueprintWorkflowDraftV1(blueprint));
        return;
      }
      if (blueprintRoute.resource === 'simulation') {
        json(response, 200, simulateFhKuikaBlueprintV1(blueprint));
        return;
      }

      json(response, 200, buildFhKuikaBlueprintDetailViewV1(blueprint));
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/roles') {
      json(response, 200, { roles: listFhKuikaMarketplaceRolesV1() });
      return;
    }

    const marketplaceRoleRoute = parseFhKuikaMarketplaceRoleRoute(url.pathname);
    if (marketplaceRoleRoute) {
      const role = getFhKuikaMarketplaceRoleV1(marketplaceRoleRoute.roleId);
      if (!role) {
        json(response, 404, {
          error: 'role_not_found',
          roleId: marketplaceRoleRoute.roleId,
        });
        return;
      }
      json(response, 200, { role });
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/solution-packs') {
      json(response, 200, { packs: listFhKuikaSolutionPacksV1() });
      return;
    }

    const solutionPackRoute = parseFhKuikaSolutionPackRoute(url.pathname);
    if (solutionPackRoute) {
      const pack = getFhKuikaSolutionPackV1(solutionPackRoute.packId);
      if (!pack) {
        json(response, 404, {
          error: 'solution_pack_not_found',
          packId: solutionPackRoute.packId,
        });
        return;
      }
      const availableRoleRefs = listFhKuikaMarketplaceRolesV1().map(
        (role) => role.id + '@' + role.version,
      );
      json(response, 200, {
        pack,
        plan: buildFhKuikaSolutionPackInstallPlanV1(pack, availableRoleRefs, []),
      });
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/workflows/validate') {
      const definition = readWorkflowDefinition(url);
      json(response, 200, validateFhKuikaWorkflowDraftDefinitionV1(definition));
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/workflows/simulate') {
      const definition = readWorkflowDefinition(url);
      json(response, 200, simulateFhKuikaWorkflowDraftV1(definition));
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/workflows/diff') {
      const definition = readWorkflowDefinition(url);
      json(response, 200, buildFhKuikaWorkflowVersionDiffV1(null, definition));
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/workbench') {
      const rawMode = (url.searchParams.get('mode') ?? 'ASK').toUpperCase();
      if (!['ASK', 'PLAN', 'EXECUTE', 'REVIEW'].includes(rawMode)) {
        json(response, 400, { error: 'invalid_workbench_mode', mode: rawMode });
        return;
      }
      json(
        response,
        200,
        buildFhKuikaWorkbenchSnapshotV1(readModel.homeSnapshot(), rawMode as FhKuikaWorkbenchMode, {
          evidenceIds: url.searchParams.getAll('evidenceId'),
        }),
      );
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/operate') {
      json(
        response,
        200,
        buildOperationsConsoleSnapshot(readModel, {
          recentRunLimit: readLimit(url, 20),
        }),
      );
      return;
    }

    const kuikaRunRoute = parseFhKuikaRunRoute(url.pathname);
    if (kuikaRunRoute) {
      const detail = buildFhKuikaRunDetailV1(readModel, kuikaRunRoute.runId, readLimit(url, 1_000));
      if (!detail) {
        json(response, 404, { error: 'run_not_found', runId: kuikaRunRoute.runId });
        return;
      }
      json(response, 200, detail);
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/connectors') {
      json(response, 200, { connectors: listFhKuikaConnectorCatalogV1() });
      return;
    }

    const connectorRoute = parseFhKuikaConnectorRoute(url.pathname);
    if (connectorRoute) {
      const connector = getFhKuikaConnectorCatalogItemV1(connectorRoute.connectorId);
      if (!connector) {
        json(response, 404, {
          error: 'connector_not_found',
          connectorId: connectorRoute.connectorId,
        });
        return;
      }
      json(response, 200, { review: buildFhKuikaConnectorInstallReviewV1(connector) });
      return;
    }

    if (url.pathname === '/api/modules/fh-kuika/approvals') {
      json(response, 200, buildFhKuikaApprovalInboxV1(readModel));
      return;
    }

    if (url.pathname === '/api/management') {
      json(response, 200, buildManagementSnapshot(readModel, readLimit(url, 50)));
      return;
    }

    const route = parseRunRoute(url.pathname);
    if (route) {
      const limit = readLimit(url, 1_000);

      if (route.resource === 'detail') {
        const detail = readModel.runDetail(route.runId, limit);
        if (!detail) {
          json(response, 404, { error: 'run_not_found', runId: route.runId });
          return;
        }
        json(response, 200, detail);
        return;
      }

      if (!readModel.getRun(route.runId)) {
        json(response, 404, { error: 'run_not_found', runId: route.runId });
        return;
      }

      if (route.resource === 'events') {
        json(response, 200, { events: readModel.listEvents(route.runId, limit) });
        return;
      }
      if (route.resource === 'model-calls') {
        json(response, 200, { modelCalls: readModel.listModelCalls(route.runId, limit) });
        return;
      }
      if (route.resource === 'artifacts') {
        json(response, 200, { artifacts: readModel.listArtifacts(route.runId, limit) });
        return;
      }
    }

    json(response, 404, { error: 'not_found' });
  } catch (error) {
    if (error instanceof MissingDashboardDatabaseError) {
      json(response, 503, {
        error: 'database_not_ready',
        databasePath: error.filePath,
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'unknown error';
    json(response, 500, { error: 'dashboard_error', message });
  }
}

function readWorkflowDefinition(url: URL) {
  const raw = url.searchParams.get('definition');
  if (!raw) throw new Error('workflow definition query parameter is required');
  if (raw.length > 100_000) throw new Error('workflow definition query parameter is too large');

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('workflow definition must be an object');
  }

  return parsed as Parameters<typeof validateFhKuikaWorkflowDraftDefinitionV1>[0];
}

function parseFhKuikaMarketplaceRoleRoute(pathname: string): {
  readonly roleId: string;
} | null {
  const match = /^\/api\/modules\/fh-kuika\/roles\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return null;
  return { roleId: decodeURIComponent(match[1]) };
}

function parseFhKuikaSolutionPackRoute(pathname: string): {
  readonly packId: string;
} | null {
  const match = /^\/api\/modules\/fh-kuika\/solution-packs\/([^/]+)(?:\/plan)?$/.exec(
    pathname,
  );
  if (!match?.[1]) return null;
  return { packId: decodeURIComponent(match[1]) };
}

function parseFhKuikaBlueprintRoute(pathname: string): {
  readonly blueprintId: string;
  readonly resource: 'detail' | 'draft' | 'simulation';
} | null {
  const match = /^\/api\/modules\/fh-kuika\/blueprints\/([^/]+)(?:\/(draft|simulation))?$/.exec(
    pathname,
  );
  if (!match?.[1]) return null;
  return {
    blueprintId: decodeURIComponent(match[1]),
    resource: (match[2] ?? 'detail') as 'detail' | 'draft' | 'simulation',
  };
}

function parseFhKuikaConnectorRoute(pathname: string): {
  readonly connectorId: string;
} | null {
  const match = /^\/api\/modules\/fh-kuika\/connectors\/([^/]+)\/review$/.exec(pathname);
  if (!match?.[1]) return null;
  return { connectorId: decodeURIComponent(match[1]) };
}

function parseFhKuikaRunRoute(pathname: string): { readonly runId: string } | null {
  const match = /^\/api\/modules\/fh-kuika\/runs\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return null;
  return { runId: decodeURIComponent(match[1]) };
}

function parseRunRoute(pathname: string): {
  readonly runId: string;
  readonly resource: 'detail' | 'events' | 'model-calls' | 'artifacts';
} | null {
  const match = /^\/api\/runs\/([^/]+)(?:\/(events|model-calls|artifacts))?$/.exec(pathname);
  if (!match?.[1]) return null;

  return {
    runId: decodeURIComponent(match[1]),
    resource: (match[2] ?? 'detail') as 'detail' | 'events' | 'model-calls' | 'artifacts',
  };
}

function readLimit(url: URL, defaultValue: number): number {
  const raw = url.searchParams.get('limit');
  if (!raw) return defaultValue;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error('limit must be an integer between 1 and 10000');
  }
  return value;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'x-freehighlander-mode': 'read-only',
  });
  response.end(body);
}

function html(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'x-freehighlander-mode': 'read-only',
  });
  response.end(body);
}

const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (executedFile === fileURLToPath(import.meta.url)) {
  const started = await startDashboardServer();
  console.log(`FreeHighlander read-only dashboard: ${started.url}`);
}
