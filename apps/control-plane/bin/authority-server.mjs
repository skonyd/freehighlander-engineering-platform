import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuthorityCapabilityStateStore, AUTHORITY_CAPABILITIES } from '@freehighlander/persistence';

import {
  AuthorityCapabilityActivationService,
  AuthorityCapabilityApprovalCoordinator,
} from '../dist/index.js';

const MAX_BODY_BYTES = 16 * 1024;
const MUTATION_PATHS = new Set([
  '/v1/authority/request',
  '/v1/authority/approve',
  '/v1/authority/activate',
  '/v1/authority/deactivate',
]);

export function createAuthorityCapabilityHttpServer(options) {
  const allowedOrigin = requireHttpOrigin(options.allowedOrigin);
  const csrfToken = options.csrfToken ?? randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/.test(csrfToken)) {
    throw new Error('csrfToken must be a 64-character lowercase hex token');
  }

  const store = new AuthorityCapabilityStateStore(options.statePath);
  const activationService = new AuthorityCapabilityActivationService(store);
  const coordinator = new AuthorityCapabilityApprovalCoordinator(activationService, {
    repository: options.repository,
    revision: options.revision,
    approverId: options.approverId,
  });

  return createServer((request, response) => {
    void handleAuthorityRequest({
      request,
      response,
      allowedOrigin,
      csrfToken,
      activationService,
      coordinator,
    });
  });
}

export async function startAuthorityCapabilityHttpServer(options) {
  const server = createAuthorityCapabilityHttpServer(options);
  const port = options.port ?? 4311;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('authority server address unavailable');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleAuthorityRequest(context) {
  const { request, response, allowedOrigin, csrfToken, activationService, coordinator } = context;
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const origin = request.headers.origin ?? null;
  const corsAllowed = origin === allowedOrigin;

  if (method === 'OPTIONS') {
    if (!corsAllowed) return sendJson(response, 403, { error: 'origin_not_allowed' });
    response.writeHead(204, corsHeaders(allowedOrigin));
    response.end();
    return;
  }

  if (url.pathname === '/v1/authority' && method === 'GET') {
    const snapshot = activationService.snapshot();
    return sendJson(
      response,
      200,
      {
        schemaVersion: 1,
        generation: snapshot.generation,
        state: snapshot.state,
        approvals: Object.fromEntries(
          AUTHORITY_CAPABILITIES.map((capability) => [capability, coordinator.approval(capability)]),
        ),
        authority: 'CONTROL_PLANE_POLICY_GATED',
      },
      corsAllowed ? allowedOrigin : null,
    );
  }

  if (url.pathname === '/v1/authority/session' && method === 'GET') {
    if (!corsAllowed) return sendJson(response, 403, { error: 'origin_not_allowed' });
    return sendJson(
      response,
      200,
      {
        schemaVersion: 1,
        csrfToken,
        authority: 'NONE',
      },
      allowedOrigin,
    );
  }

  if (!MUTATION_PATHS.has(url.pathname)) {
    return sendJson(response, 404, { error: 'not_found' }, corsAllowed ? allowedOrigin : null);
  }
  if (method !== 'POST') {
    return sendJson(response, 405, { error: 'method_not_allowed', allowed: ['POST'] });
  }
  if (!corsAllowed) return sendJson(response, 403, { error: 'origin_not_allowed' });
  if (request.headers['x-freehighlander-csrf'] !== csrfToken) {
    return sendJson(
      response,
      403,
      { error: 'csrf_validation_failed' },
      allowedOrigin,
    );
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request body';
    return sendJson(response, 400, { error: 'invalid_request_body', message }, allowedOrigin);
  }

  let input;
  try {
    input = parseMutationInput(url.pathname, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid mutation input';
    return sendJson(response, 400, { error: 'invalid_mutation_input', message }, allowedOrigin);
  }

  const result =
    url.pathname === '/v1/authority/request'
      ? activationService.setRequested(input.capability, input.requested, input.expectedGeneration)
      : url.pathname === '/v1/authority/approve'
        ? coordinator.approve(input.capability, input.expectedGeneration)
        : url.pathname === '/v1/authority/activate'
          ? coordinator.activateApproved(input.capability, input.expectedGeneration)
          : activationService.deactivate(input.capability, input.expectedGeneration);

  const status = result.status === 'BLOCKED' || result.status === 'CONFLICT' ? 409 : 200;
  return sendJson(response, status, { result }, allowedOrigin);
}

function parseMutationInput(pathname, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request body must be a JSON object');
  }
  const allowedKeys =
    pathname === '/v1/authority/request'
      ? new Set(['capability', 'requested', 'expectedGeneration'])
      : new Set(['capability', 'expectedGeneration']);

  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) throw new Error('unknown field: ' + unknown);

  if (!AUTHORITY_CAPABILITIES.includes(value.capability)) {
    throw new Error('unknown authority capability');
  }
  if (!Number.isInteger(value.expectedGeneration) || value.expectedGeneration < 0) {
    throw new Error('expectedGeneration must be a non-negative integer');
  }
  if (pathname === '/v1/authority/request' && typeof value.requested !== 'boolean') {
    throw new Error('requested must be a boolean');
  }

  return value;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body exceeds 16384 bytes');
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new Error('request body is required');

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request body must contain valid JSON');
  }
}

function sendJson(response, status, value, allowedOrigin = null) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'x-freehighlander-authority-plane': 'control-plane',
    ...(allowedOrigin ? corsHeaders(allowedOrigin) : {}),
  });
  response.end(body);
}

function corsHeaders(allowedOrigin) {
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-freehighlander-csrf',
    vary: 'Origin',
  };
}

function requireHttpOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('allowedOrigin must use http or https');
  }
  if (parsed.origin !== value) throw new Error('allowedOrigin must be an exact origin');
  return value;
}

async function runCli() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const revision =
    process.env.FREEHIGHLANDER_AUTHORITY_REVISION ?? resolveGitRevision(root);
  const repository =
    process.env.FREEHIGHLANDER_REPOSITORY ?? resolveGitRepository(root);

  const started = await startAuthorityCapabilityHttpServer({
    statePath:
      process.env.FREEHIGHLANDER_AUTHORITY_STATE ??
      path.join(root, '.freehighlander', 'runtime', 'authority-capabilities.json'),
    repository,
    revision,
    approverId: process.env.FREEHIGHLANDER_APPROVER_ID ?? 'local-operator',
    allowedOrigin: process.env.FREEHIGHLANDER_AUTHORITY_UI_ORIGIN ?? 'http://127.0.0.1:4310',
    port: Number(process.env.FREEHIGHLANDER_AUTHORITY_PORT ?? 4311),
  });
  console.log(`FreeHighlander authority control-plane: ${started.url}`);
}

function resolveGitRevision(root) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('unable to resolve an exact git revision');
  }
  return revision;
}

function resolveGitRepository(root) {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match =
    /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote) ??
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match?.[1]) throw new Error('unable to resolve GitHub repository from origin');
  return match[1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
