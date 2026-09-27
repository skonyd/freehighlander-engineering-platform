export const FH_KUIKA_KNOWLEDGE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Knowledge</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #121821;
      --panel2: #171f2a;
      --line: #263241;
      --text: #e8eef6;
      --muted: #93a4b8;
      --accent: #7dd3fc;
      --good: #86efac;
      --warn: #fde68a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, #122032 0, var(--bg) 38rem);
      color: var(--text);
      font: 14px/1.5 ui-sans-serif, system-ui;
    }
    header, main { max-width: 1180px; margin: auto; padding: 24px; }
    header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
    h1 { margin: 0; font-size: 25px; }
    a { color: var(--accent); text-decoration: none; }
    .muted { color: var(--muted); }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: .14em;
      font-weight: 700;
    }
    .card {
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
    }
    .search {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px auto;
      gap: 10px;
      margin-bottom: 14px;
    }
    input, select, button {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
    }
    button { cursor: pointer; }
    button:hover { border-color: var(--accent); }
    .tabs { display: flex; gap: 8px; margin: 14px 0; }
    .tabs button[aria-selected="true"] { border-color: var(--accent); color: var(--accent); }
    .result { padding: 12px 0; border-top: 1px solid var(--line); }
    .result:first-child { border-top: 0; }
    .badge {
      display: inline-flex;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 10px;
      margin-right: 6px;
    }
    .authoritative { color: var(--good); }
    .discovery { color: var(--warn); }
    .meta {
      display: grid;
      grid-template-columns: 130px minmax(0, 1fr);
      gap: 5px 10px;
      margin-top: 8px;
      font-size: 12px;
    }
    .meta span:nth-child(odd) { color: var(--muted); }
    @media (max-width: 760px) {
      header { flex-direction: column; }
      .search, .meta { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Knowledge</div>
      <h1>Engineering Knowledge</h1>
      <div id="status" class="muted">Lineage-first · deterministic · authority NONE</div>
    </div>
    <div><a href="/modules/fh-kuika">← Module</a> · <a href="/">Core Home</a></div>
  </header>
  <main>
    <section class="card">
      <div class="search">
        <input id="query" placeholder="Artifact ID or engineering query" aria-label="Knowledge query" />
        <select id="mode" aria-label="Query mode">
          <option value="HYBRID">Hybrid</option>
          <option value="EXACT_ENTITY">Exact entity</option>
          <option value="EXACT_REVISION">Exact revision</option>
        </select>
        <button id="search" type="button">Search</button>
      </div>
      <div class="tabs" role="tablist">
        <button data-tab="results" aria-selected="true">Search</button>
        <button data-tab="graph" aria-selected="false">Graph</button>
        <button data-tab="evidence" aria-selected="false">Evidence</button>
      </div>
      <div id="content" class="muted">
        Search uses recorded engineering state only. Semantic discovery is off by default.
      </div>
    </section>
  </main>
<script>
const esc = value => String(value ?? '—').replace(/[&<>"']/g, ch => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
));
let last = null;
let tab = 'results';

async function api(path) {
  const response = await fetch(path, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || response.statusText);
  return body;
}

function renderResult(item) {
  const className = item.resultClass === 'AUTHORITATIVE' ? 'authoritative' : 'discovery';
  const revision = item.provenance.revision
    ? item.provenance.revision.repository + '@' + item.provenance.revision.sha.slice(0, 12)
    : '—';
  return '<div class="result"><span class="badge ' + className + '">' +
    esc(item.resultClass) + '</span><strong>' + esc(item.label) + '</strong>' +
    '<div class="meta"><span>Source</span><code>' +
    esc(item.provenance.sourceKind) + ' · ' + esc(item.provenance.sourceId) +
    '</code><span>Revision</span><code>' + esc(revision) +
    '</code><span>Evidence</span><code>' +
    esc((item.provenance.evidenceIds || []).join(', ') || '—') +
    '</code><span>Authority</span><strong>' + esc(item.authority) +
    '</strong></div></div>';
}

function render() {
  const target = document.querySelector('#content');
  if (!last) {
    target.textContent =
      'Search uses recorded engineering state only. Semantic discovery is off by default.';
    return;
  }

  if (tab === 'graph') {
    const edges = last.results.filter(item => item.relationType);
    target.innerHTML = edges.length
      ? edges.map(item =>
          '<div class="result"><span class="badge authoritative">AUTHORITATIVE</span><strong>' +
          esc(item.label) + '</strong><div class="muted">' + esc(item.relationType) + '</div></div>'
        ).join('')
      : '<div class="muted">No recorded authoritative lineage relations for this query. FreeHighlander will not invent graph edges.</div>';
    return;
  }

  if (tab === 'evidence') {
    const items = last.results.filter(item =>
      item.provenance.sourceKind === 'EVIDENCE' ||
      (item.provenance.evidenceIds || []).length
    );
    target.innerHTML = items.length
      ? items.map(renderResult).join('')
      : '<div class="muted">No evidence-bound results for this query.</div>';
    return;
  }

  target.innerHTML = last.results.length
    ? last.results.map(renderResult).join('')
    : '<div class="muted">No deterministic result found.</div>';
}

async function search() {
  const query = document.querySelector('#query').value.trim();
  const mode = document.querySelector('#mode').value;
  if (!query) {
    document.querySelector('#content').textContent = 'Enter an artifact ID or query.';
    return;
  }

  const params = new URLSearchParams({ text: query, mode });
  if (mode === 'EXACT_ENTITY') params.set('entityId', query);
  if (mode === 'EXACT_REVISION') {
    const separator = query.lastIndexOf('@');
    if (separator < 1) {
      document.querySelector('#content').textContent =
        'Exact revision format: repository@40-or-64-char-sha';
      return;
    }
    params.set('repository', query.slice(0, separator));
    params.set('sha', query.slice(separator + 1));
  }

  document.querySelector('#status').textContent = 'Searching deterministic knowledge sources…';
  try {
    last = await api('/api/modules/fh-kuika/knowledge/query?' + params.toString());
    document.querySelector('#status').textContent =
      last.results.length + ' results · model calls 0 · authority NONE';
    render();
  } catch (error) {
    document.querySelector('#status').textContent = 'Knowledge query failed';
    document.querySelector('#content').textContent = error.message;
  }
}

document.querySelector('#search').addEventListener('click', () => void search());
document.querySelector('#query').addEventListener('keydown', event => {
  if (event.key === 'Enter') void search();
});
document.querySelectorAll('[data-tab]').forEach(button =>
  button.addEventListener('click', () => {
    tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(item =>
      item.setAttribute('aria-selected', String(item === button))
    );
    render();
  })
);
</script>
</body>
</html>`;

export function knowledgePageCanInvokeModel(): false {
  return false;
}

export function knowledgePageCanGrantAuthority(): false {
  return false;
}

export function knowledgePageCanMutateDomain(): false {
  return false;
}
