import { execFileSync } from 'node:child_process';

export function evaluateRepositoryReconciliation(input) {
  const errors = [];
  const warnings = [];
  const expectedBranch = input.state.active_work?.branch;

  if (!expectedBranch) errors.push('state active_work.branch is required');
  if (!input.localBranch) errors.push('local branch is detached or unavailable');

  if (expectedBranch && input.localBranch && input.localBranch !== expectedBranch) {
    errors.push(`local branch ${input.localBranch} does not match state branch ${expectedBranch}`);
  }

  if (!input.localHead) errors.push('local HEAD is unavailable');
  if (!input.remoteHead) {
    errors.push(`remote branch ${expectedBranch ?? '<unknown>'} is missing`);
  } else if (input.localHead && input.localHead !== input.remoteHead) {
    errors.push('local HEAD does not match remote branch HEAD');
  }

  const expectedPr = input.state.active_work?.pull_request;
  if (expectedPr !== null && expectedPr !== undefined) {
    if (!input.pullRequest) {
      errors.push(`active PR #${expectedPr} could not be verified`);
    } else {
      if (input.pullRequest.number !== expectedPr) errors.push('active PR number mismatch');
      if (input.pullRequest.state !== 'open') errors.push(`active PR #${expectedPr} is not open`);
      if (expectedBranch && input.pullRequest.headRef !== expectedBranch) {
        errors.push(`active PR #${expectedPr} head branch mismatch`);
      }
      if (input.remoteHead && input.pullRequest.headSha !== input.remoteHead) {
        errors.push(`active PR #${expectedPr} head SHA mismatch`);
      }
    }
  }

  if (input.state.external_dependency && input.externalPullRequest) {
    const expected = input.state.external_dependency;
    if (input.externalPullRequest.number !== expected.pull_request) {
      warnings.push('external dependency PR number mismatch');
    }
    if (
      expected.expected_head &&
      input.externalPullRequest.headSha &&
      expected.expected_head !== input.externalPullRequest.headSha
    ) {
      warnings.push('external dependency head changed; reconcile canonical state');
    }
  }

  return {
    canonical: errors.length === 0,
    expectedBranch: expectedBranch ?? null,
    localBranch: input.localBranch ?? null,
    localHead: input.localHead ?? null,
    remoteHead: input.remoteHead ?? null,
    errors,
    warnings,
  };
}

export async function collectRepositoryReconciliation(root, state, options = {}) {
  const runGit = options.runGit ?? defaultRunGit(root);
  const fetchPullRequest = options.fetchPullRequest ?? defaultFetchPullRequest;

  const localBranch = safeGit(runGit, ['branch', '--show-current']);
  const localHead = safeGit(runGit, ['rev-parse', 'HEAD']);
  const expectedBranch = state.active_work?.branch;
  const remoteHead = expectedBranch
    ? parseLsRemote(safeGit(runGit, ['ls-remote', 'origin', `refs/heads/${expectedBranch}`]))
    : null;

  let pullRequest = null;
  if (Number.isInteger(state.active_work?.pull_request)) {
    pullRequest = await fetchPullRequest(state.repository, state.active_work.pull_request);
  }

  let externalPullRequest = null;
  if (
    state.external_dependency?.repository &&
    Number.isInteger(state.external_dependency?.pull_request)
  ) {
    try {
      externalPullRequest = await fetchPullRequest(
        state.external_dependency.repository,
        state.external_dependency.pull_request,
      );
    } catch {
      externalPullRequest = null;
    }
  }

  return evaluateRepositoryReconciliation({
    state,
    localBranch,
    localHead,
    remoteHead,
    pullRequest,
    externalPullRequest,
  });
}

export function assertSafeCheckpointWorktree(statusText) {
  if (!statusText.trim()) return;

  const forbidden = statusText
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .filter(isForbiddenCheckpointPath);

  if (forbidden.length > 0) {
    throw new Error(`checkpoint refused: forbidden runtime/secret paths: ${forbidden.join(', ')}`);
  }

  throw new Error('checkpoint refused: worktree is dirty');
}

export function isForbiddenCheckpointPath(file) {
  return (
    /(^|\/)\.env(?:\.|$)/.test(file) ||
    file.startsWith('.freehighlander/runtime/') ||
    /(^|\/)(node_modules|dist|coverage)(\/|$)/.test(file) ||
    /\.(?:log|db|sqlite)$/i.test(file) ||
    /(?:secret|credential|token)(?:\.|-|_|$)/i.test(file)
  );
}

export function checkpointCanInferSemanticGatePass() {
  return false;
}

function defaultRunGit(root) {
  return (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function safeGit(runGit, args) {
  try {
    return runGit(args);
  } catch {
    return '';
  }
}

function parseLsRemote(output) {
  if (!output.trim()) return null;
  return output.trim().split(/\s+/)[0] ?? null;
}

async function defaultFetchPullRequest(repository, number) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'freehighlander-project-reconciliation',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`GitHub PR lookup failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    number: data.number,
    state: data.state,
    headRef: data.head?.ref ?? null,
    headSha: data.head?.sha ?? null,
    baseRef: data.base?.ref ?? null,
  };
}
