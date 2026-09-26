import {
  getFhKuikaCuratedBlueprintV1,
  getFhKuikaCuratedBlueprintsV1,
} from './kuika-blueprint-catalog.js';
import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';

export function renderFhKuikaBlueprintCatalogHtml(): string {
  const blueprints = getFhKuikaCuratedBlueprintsV1();
  const cards = blueprints.map(renderCard).join('');

  return page(
    'Blueprints',
    'Deterministic, versioned engineering patterns. Catalog inspection never invokes a model or grants authority.',
    '<section class="grid">' + cards + '</section>',
  );
}

export function renderFhKuikaBlueprintDetailHtml(id: string): string | null {
  const blueprint = getFhKuikaCuratedBlueprintV1(id);
  if (!blueprint) return null;

  const stages = blueprint.lifecycleStages.map((stage) => '<span class="chip">' + esc(stage) + '</span>').join('');
  const roles = blueprint.requiredRoles.map((role) => '<li><code>' + esc(role) + '</code></li>').join('');
  const evidence = blueprint.requiredEvidence.map((item) => '<li><code>' + esc(item) + '</code></li>').join('');
  const gates = blueprint.authoritySensitiveNodes.map((item) => '<li><code>' + esc(item) + '</code></li>').join('');
  const rules = blueprint.validationRules.map((item) => '<li>' + esc(item) + '</li>').join('');
  const fixtures = blueprint.simulationFixtures
    .map(
      (fixture) =>
        '<tr><td><code>' +
        esc(fixture.id) +
        '</code></td><td>' +
        esc(fixture.description) +
        '</td><td><span class="badge">' +
        esc(fixture.expectedTerminalState) +
        '</span></td></tr>',
    )
    .join('');

  const body =
    '<div class="detail-head">' +
    '<div><div class="eyebrow">Published blueprint</div><h2>' +
    esc(blueprint.id) +
    '</h2><p>' +
    esc(blueprint.purpose) +
    '</p></div>' +
    '<div class="meta"><span class="badge">' +
    esc(blueprint.defaultRiskTier) +
    '</span><span class="badge">v' +
    esc(blueprint.version) +
    '</span></div></div>' +
    '<section class="card"><h3>Lifecycle</h3><div class="chips">' +
    stages +
    '</div></section>' +
    '<section class="columns">' +
    '<div class="card"><h3>Required roles</h3><ul>' +
    roles +
    '</ul></div>' +
    '<div class="card"><h3>Required evidence</h3><ul>' +
    evidence +
    '</ul></div>' +
    '<div class="card"><h3>Authority-sensitive nodes</h3><ul>' +
    gates +
    '</ul></div></section>' +
    '<section class="columns two">' +
    '<div class="card"><h3>Independence</h3>' +
    '<div class="row"><span>Required</span><strong>' +
    String(blueprint.independence.required) +
    '</strong></div>' +
    '<div class="row"><span>Distinct reviewers</span><strong>' +
    String(blueprint.independence.minimumDistinctReviewers) +
    '</strong></div>' +
    '<div class="row"><span>Self review forbidden</span><strong>' +
    String(blueprint.independence.forbiddenSelfReview) +
    '</strong></div></div>' +
    '<div class="card"><h3>Validation rules</h3><ul>' +
    rules +
    '</ul></div></section>' +
    '<section class="card"><h3>Simulation fixtures</h3><div class="wide"><table><thead><tr><th>Fixture</th><th>Purpose</th><th>Expected</th></tr></thead><tbody>' +
    fixtures +
    '</tbody></table></div></section>' +
    '<details class="card advanced"><summary>Technical identity</summary>' +
    '<div class="row"><span>Workflow template</span><code>' +
    esc(blueprint.workflowTemplateRef) +
    '</code></div>' +
    '<div class="row"><span>Blueprint hash</span><code>' +
    esc(blueprint.blueprintHash) +
    '</code></div>' +
    '<div class="row"><span>Authority</span><strong>' +
    esc(blueprint.authority) +
    '</strong></div></details>';

  return page(
    'Blueprint Detail',
    '<a href="/modules/fh-kuika/build/blueprints">← Blueprint Catalog</a>',
    body,
  );
}

export function fhKuikaBlueprintCatalogUiCanInvokeModel(): false {
  return false;
}

export function fhKuikaBlueprintCatalogUiCanMutateRuntime(): false {
  return false;
}

export function fhKuikaBlueprintCatalogUiCanGrantAuthority(): false {
  return false;
}

function renderCard(blueprint: FhKuikaPublishedBlueprintV1): string {
  const stages = blueprint.lifecycleStages.slice(0, 4).map(esc).join(' → ');
  return (
    '<a class="card blueprint" href="/modules/fh-kuika/build/blueprints/' +
    encodeURIComponent(blueprint.id) +
    '">' +
    '<div class="card-head"><h2>' +
    esc(titleCase(blueprint.id)) +
    '</h2><span class="badge">' +
    esc(blueprint.defaultRiskTier) +
    '</span></div>' +
    '<p>' +
    esc(blueprint.purpose) +
    '</p>' +
    '<div class="stages">' +
    stages +
    (blueprint.lifecycleStages.length > 4 ? ' …' : '') +
    '</div>' +
    '<div class="foot">v' +
    esc(blueprint.version) +
    ' · ' +
    String(blueprint.requiredRoles.length) +
    ' roles · ' +
    String(blueprint.requiredEvidence.length) +
    ' evidence requirements</div></a>'
  );
}

function page(title: string, subtitle: string, body: string): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA · ${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#e8eef6;
      --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac; --warn:#fde68a;
    }
    * { box-sizing:border-box; }
    body {
      margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);
      color:var(--text);
      font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; } h2 { margin:0; font-size:17px; } h3 { margin:0 0 10px; font-size:14px; }
    p { color:var(--muted); margin:8px 0 0; }
    a { color:var(--accent); text-decoration:none; } a:hover,a:focus-visible { text-decoration:underline; }
    code { color:#c4d7ec; overflow-wrap:anywhere; }
    .eyebrow { color:var(--accent); text-transform:uppercase; font-size:11px; letter-spacing:.14em; font-weight:700; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
    .columns { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:14px; }
    .columns.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .card {
      background:color-mix(in srgb,var(--panel) 92%,transparent);
      border:1px solid var(--line); border-radius:12px; padding:16px;
    }
    a.card { color:var(--text); display:block; } a.card:hover,a.card:focus-visible { border-color:#52677d; text-decoration:none; }
    .card-head,.detail-head,.row { display:flex; justify-content:space-between; gap:12px; align-items:center; }
    .detail-head { margin-bottom:16px; align-items:flex-start; }
    .meta,.chips { display:flex; gap:7px; flex-wrap:wrap; }
    .badge,.chip { border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:11px; }
    .badge { color:var(--good); } .chip { color:var(--accent); }
    .stages { margin-top:14px; font-size:12px; color:var(--accent); }
    .foot { margin-top:10px; color:var(--muted); font-size:11px; }
    ul { padding-left:19px; margin:0; } li + li { margin-top:5px; }
    .row { border-top:1px solid var(--line); padding:7px 0; } .row:first-of-type { border-top:0; }
    table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:9px 7px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; }
    .advanced { margin-top:14px; } summary { cursor:pointer; color:var(--accent); }
    .boundary { margin-top:18px; color:var(--muted); font-size:12px; }
    @media (max-width:850px) { .grid,.columns,.columns.two { grid-template-columns:1fr; } header { flex-direction:column; } }
    @media (max-width:560px) { header,main { padding:16px; } .wide { overflow-x:auto; } }
  </style>
</head>
<body>
<header>
  <div>
    <div class="eyebrow">FH-KUIKA · Build</div>
    <h1>${title}</h1>
    <div class="muted">${subtitle}</div>
  </div>
  <div><a href="/modules/fh-kuika/build">← Build</a> · <a href="/">Core Home</a></div>
</header>
<main>
  ${body}
  <div class="boundary">
    Blueprint catalog inspection is read-only. Published blueprints are immutable data,
    do not invoke a model and cannot grant execution authority.
  </div>
</main>
</body>
</html>`;
}

function titleCase(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}
