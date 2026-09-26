import type { FhKuikaPublishedBlueprintV1 } from './kuika-blueprint.js';

export const FH_KUIKA_BLUEPRINTS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Blueprints</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --panel2:#171f2a; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac; --warn:#fde68a;
    }
    *{box-sizing:border-box}
    body{margin:0;background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    header,main{max-width:1180px;margin:auto;padding:24px}
    header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
    h1{margin:0;font-size:25px} h2{margin:0 0 8px;font-size:16px}
    a{color:var(--accent);text-decoration:none} a:hover,a:focus-visible{text-decoration:underline}
    .eyebrow{color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:.14em;font-weight:700}
    .muted{color:var(--muted)}
    .layout{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:14px}
    .card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px}
    .list button{width:100%;text-align:left;background:transparent;color:var(--text);border:0;border-top:1px solid var(--line);padding:12px 0;cursor:pointer}
    .list button:first-child{border-top:0;padding-top:0}
    .list button:hover,.list button:focus-visible{color:var(--accent);outline:none}
    .badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:11px;margin-right:6px}
    .good{color:var(--good)} .warn{color:var(--warn)}
    .meta{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 12px;margin-top:14px}
    .meta span:nth-child(odd){color:var(--muted)}
    .stages{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
    .stage{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 8px}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
    .actions button{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:pointer}
    .actions button:hover,.actions button:focus-visible{border-color:var(--accent);outline:none}
    pre{white-space:pre-wrap;word-break:break-word;background:#090d12;border:1px solid var(--line);border-radius:9px;padding:12px;max-height:360px;overflow:auto}
    .empty{color:var(--muted);padding:24px 0;text-align:center}
    @media(max-width:820px){.layout{grid-template-columns:1fr}header{flex-direction:column}.meta{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header>
  <div>
    <div class="eyebrow">FH-KUIKA · Build</div>
    <h1>Blueprint Catalog</h1>
    <div id="status" class="muted" role="status" aria-live="polite">Loading deterministic blueprint catalog…</div>
  </div>
  <div><a href="/modules/fh-kuika/build">← Build</a> · <a href="/">Core Home</a></div>
</header>
<main>
  <section class="layout">
    <div class="card">
      <h2>Curated Blueprints</h2>
      <div id="list" class="list"><div class="empty">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Blueprint Detail</h2>
      <div id="detail" class="empty">Select a blueprint.</div>
    </div>
  </section>
</main>
<script>
const esc=value=>String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(path){const r=await fetch(path,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.message||b.error||r.statusText);return b}
let catalog=[];
async function load(){
  try{
    const body=await api('/api/modules/fh-kuika/blueprints');
    catalog=body.blueprints||[];
    document.querySelector('#status').textContent=catalog.length+' published deterministic blueprints · authority NONE';
    document.querySelector('#list').innerHTML=catalog.map(item=>
      '<button data-id="'+esc(item.id)+'"><strong>'+esc(item.id)+'</strong><div class="muted">'+esc(item.purpose)+'</div><div><span class="badge">'+esc(item.defaultRiskTier)+'</span><span class="badge">'+esc(item.version)+'</span></div></button>'
    ).join('')||'<div class="empty">No blueprints available.</div>';
    document.querySelectorAll('button[data-id]').forEach(button=>button.addEventListener('click',()=>void loadDetail(button.dataset.id)));
    if(catalog[0]) void loadDetail(catalog[0].id);
  }catch(error){document.querySelector('#status').textContent='Blueprint catalog unavailable: '+error.message}
}
async function loadDetail(id){
  const target=document.querySelector('#detail');
  target.innerHTML='<div class="empty">Loading blueprint…</div>';
  try{
    const body=await api('/api/modules/fh-kuika/blueprints/'+encodeURIComponent(id));
    const item=body.blueprint;
    target.innerHTML=
      '<div><span class="badge">'+esc(item.defaultRiskTier)+'</span><span class="badge">'+esc(item.status)+'</span></div>'+
      '<h2 style="margin-top:12px">'+esc(item.id)+' · '+esc(item.version)+'</h2>'+
      '<div class="muted">'+esc(item.purpose)+'</div>'+
      '<div class="meta">'+
        '<span>Workflow template</span><code>'+esc(item.workflowTemplateRef)+'</code>'+
        '<span>Required roles</span><strong>'+esc(item.requiredRoles.join(', '))+'</strong>'+
        '<span>Required evidence</span><strong>'+esc(item.requiredEvidence.join(', '))+'</strong>'+
        '<span>Independent review</span><strong>'+esc(item.independence.required?'REQUIRED':'NOT REQUIRED')+'</strong>'+
        '<span>Hash</span><code>'+esc(item.blueprintHash.slice(0,16))+'…</code>'+
      '</div>'+
      '<div class="muted" style="margin-top:14px">Lifecycle</div>'+
      '<div class="stages">'+item.lifecycleStages.map(stage=>'<span class="stage">'+esc(stage)+'</span>').join('')+'</div>'+
      '<div class="actions"><button id="prepare">Prepare workflow draft</button><button id="simulate">Simulate fixtures</button></div>'+
      '<pre id="output">No preparation performed. Buttons are deterministic and invoke no model.</pre>';
    document.querySelector('#prepare').addEventListener('click',()=>void prepare(id,false));
    document.querySelector('#simulate').addEventListener('click',()=>void prepare(id,true));
  }catch(error){target.innerHTML='<div class="warn">'+esc(error.message)+'</div>'}
}
async function prepare(id,simulationOnly){
  const output=document.querySelector('#output');
  output.textContent='Preparing deterministic candidate…';
  try{
    const body=await api('/api/modules/fh-kuika/blueprints/'+encodeURIComponent(id)+'/prepare');
    output.textContent=JSON.stringify(simulationOnly?body.preparation.simulations:body.preparation,null,2);
  }catch(error){output.textContent='Preparation failed: '+error.message}
}
void load();
</script>
</body>
</html>`;

export function renderFhKuikaBlueprintSummaryV1(blueprint: FhKuikaPublishedBlueprintV1) {
  return {
    id: blueprint.id,
    version: blueprint.version,
    purpose: blueprint.purpose,
    compatibleIntents: blueprint.compatibleIntents,
    defaultRiskTier: blueprint.defaultRiskTier,
    lifecycleStages: blueprint.lifecycleStages,
    requiredRoles: blueprint.requiredRoles,
    requiredEvidence: blueprint.requiredEvidence,
    independence: blueprint.independence,
    workflowTemplateRef: blueprint.workflowTemplateRef,
    status: blueprint.status,
    blueprintHash: blueprint.blueprintHash,
    authority: 'NONE' as const,
  };
}

export function blueprintCatalogPageCanInvokeModel(): false {
  return false;
}

export function blueprintCatalogPageCanGrantAuthority(): false {
  return false;
}

export function blueprintCatalogPageCanMutateRuntime(): false {
  return false;
}
