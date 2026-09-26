import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFhKuikaAreaHtml } from './kuika-area-ui.js';
import {
  renderFhKuikaBlueprintCatalogHtml,
  renderFhKuikaBlueprintDetailHtml,
} from './kuika-blueprint-ui.js';
import { FH_KUIKA_MODULE_HTML } from './kuika-module-ui.js';
import { FH_KUIKA_WORKBENCH_HTML } from './kuika-workbench-ui.js';
import { FH_KUIKA_OPERATIONS_HTML } from './kuika-operations-ui.js';
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

    if (url.pathname === '/modules/fh-kuika/build') {
      html(response, method === 'HEAD' ? '' : renderFhKuikaAreaHtml('BUILD'));
      return;
    }

    if (url.pathname === '/modules/fh-kuika/build/blueprints') {
      html(response, method === 'HEAD' ? '' : renderFhKuikaBlueprintCatalogHtml());
      return;
    }

    const blueprintMatch = /^\/modules\/fh-kuika\/build\/blueprints\/([^/]+)$/.exec(url.pathname);
    if (blueprintMatch?.[1]) {
      const blueprintHtml = renderFhKuikaBlueprintDetailHtml(decodeURIComponent(blueprintMatch[1]));
      if (!blueprintHtml) {
        textResponse(response, 404, method === 'HEAD' ? '' : 'Blueprint not found');
        return;
      }
      html(response, method === 'HEAD' ? '' : blueprintHtml);
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

function textResponse(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
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
