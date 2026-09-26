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
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; } h2 { margin:0; font-size:16px; }
    a { color:var(--accent); text-decoration:none; } a:hover,a:focus-visible { text-decoration:underline; }
    .eyebrow { color:var(--accent); text-transform:uppercase; font-size:11px; letter-spacing:.14em; font-weight:700; }
    .muted { color:var(--muted); }
    .layout { display:grid; grid-template-columns:minmax(0,.9fr) minmax(340px,1.1fr); gap:14px; }
    .card { background:color-mix(in srgb,var(--panel) 92%,transparent); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .catalog { display:grid; gap:9px; }
    button.blueprint {
      width:100%; text-align:left; background:var(--panel2); color:var(--text); border:1px solid var(--line);
      border-radius:9px; padding:11px 12px; cursor:pointer;
    }
    button.blueprint:hover,button.blueprint:focus-visible { border-color:var(--accent); outline:none; }
    .row { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .meta { color:var(--muted); font-size:12px; margin-top:5px; }
    .pill { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:11px; }
    .stages { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .detail-grid { display:grid; grid-template-columns:130px minmax(0,1fr); gap:7px 10px; margin-top:12px; }
    .detail-grid > span:nth-child(odd) { color:var(--muted); }
    .section { margin-top:16px; padding-top:12px; border-top:1px solid var(--line); }
    .compact { margin:7px 0 0; padding-left:18px; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
    .actions button {
      background:var(--panel2); color:var(--text); border:1px solid var(--line);
      border-radius:8px; padding:8px 10px; cursor:pointer;
    }
    .actions button:hover,.actions button:focus-visible { border-color:var(--accent); outline:none; }
    pre { white-space:pre-wrap; word-break:break-word; background:#090d12; border-radius:8px; padding:10px; max-height:260px; overflow:auto; }
    code { color:#c4d7ec; font-size:12px; overflow-wrap:anywhere; }
    .empty { color:var(--muted); padding:24px 0; text-align:center; }
    @media(max-width:820px){ .layout{grid-template-columns:1fr;} header{flex-direction:column;} }
  </style>
</head>
<body>
<header>
  <div>
    <div class="eyebrow">FH-KUIKA · Build</div>
    <h1>Engineering Blueprints</h1>
    <div id="status" class="muted">Loading curated blueprint catalog…</div>
  </div>
  <div><a href="/modules/fh-kuika/build">← Build</a> · <a href="/modules/fh-kuika">Overview</a></div>
</header>
<main>
  <section class="layout">
    <div class="card">
      <h2>Catalog</h2>
      <div id="catalog" class="catalog"><div class="empty">Loading blueprints…</div></div>
    </div>
    <aside class="card">
      <h2>Blueprint detail</h2>
      <div id="detail" class="empty">Select a blueprint.</div>
    </aside>
  </section>
</main>
<script>
const esc=value=>String(value??'—').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function api(path){
  const response=await fetch(path,{cache:'no-store'});
  const body=await response.json();
  if(!response.ok) throw new Error(body.message||body.error||response.statusText);
  return body;
}

function renderCatalog(snapshot){
  const target=document.querySelector('#catalog');
  document.querySelector('#status').textContent =
    snapshot.blueprints.length + ' curated patterns · read-only · authority NONE';
  target.innerHTML=snapshot.blueprints.map(item =>
    '<button class="blueprint" data-id="'+esc(item.id)+'">'+
      '<div class="row"><strong>'+esc(item.id)+'</strong><span class="pill">'+esc(item.defaultRiskTier)+'</span></div>'+
      '<div class="meta">v'+esc(item.version)+' · '+esc(item.purpose)+'</div>'+
      '<div class="stages">'+item.lifecycleStages.map(stage=>'<span class="pill">'+esc(stage)+'</span>').join('')+'</div>'+
    '</button>'
  ).join('');
  document.querySelectorAll('button[data-id]').forEach(button =>
    button.addEventListener('click',()=>void loadDetail(button.dataset.id))
  );
}

async function loadDetail(id){
  const target=document.querySelector('#detail');
  target.innerHTML='<div class="empty">Loading blueprint…</div>';
  try{
    const item=await api('/api/modules/fh-kuika/blueprints/'+encodeURIComponent(id));
    target.innerHTML=
      '<div class="row"><strong>'+esc(item.id)+' · v'+esc(item.version)+'</strong><span class="pill">'+esc(item.defaultRiskTier)+'</span></div>'+
      '<p class="muted">'+esc(item.purpose)+'</p>'+
      '<div class="detail-grid">'+
        '<span>Workflow</span><code>'+esc(item.workflowTemplateRef)+'</code>'+
        '<span>Roles</span><span>'+esc(item.requiredRoleIds.join(', '))+'</span>'+
        '<span>Evidence</span><span>'+esc(item.requiredEvidenceKinds.join(', '))+'</span>'+
        '<span>Independent review</span><strong>'+(item.independentReviewRequired?'Required':'No')+'</strong>'+
        '<span>Hash</span><code>'+esc(item.blueprintHash)+'</code>'+
      '</div>'+
      '<div class="section"><strong>Lifecycle</strong><div class="stages">'+
        item.lifecycleStages.map(stage=>'<span class="pill">'+esc(stage)+'</span>').join('')+'</div></div>'+
      '<div class="section"><strong>Authority-sensitive nodes</strong><ul class="compact">'+
        item.authoritySensitiveNodes.map(node=>'<li><code>'+esc(node)+'</code></li>').join('')+'</ul></div>'+
      '<div class="section"><strong>Simulation fixtures</strong><ul class="compact">'+
        item.simulationFixtures.map(fixture=>'<li>'+esc(fixture.id)+' → '+esc(fixture.expectedTerminalState)+'</li>').join('')+'</ul></div>'+
      '<div class="actions">'+
        '<button type="button" data-preview="draft">Draft preview</button>'+
        '<button type="button" data-preview="simulation">Simulation preview</button>'+
      '</div>'+
      '<div id="preview" class="section muted">Preview actions are deterministic and do not execute workflows.</div>';

    target.querySelectorAll('button[data-preview]').forEach(button =>
      button.addEventListener('click',()=>void loadPreview(id,button.dataset.preview))
    );
  }catch(error){ target.innerHTML='<div class="empty">'+esc(error.message)+'</div>'; }
}

async function loadPreview(id,kind){
  const target=document.querySelector('#preview');
  if(!target)return;
  target.innerHTML='<div class="empty">Loading preview…</div>';
  try{
    const payload=await api(
      '/api/modules/fh-kuika/blueprints/'+encodeURIComponent(id)+'/'+encodeURIComponent(kind)
    );
    if(kind==='draft'){
      target.innerHTML=
        '<strong>Workflow draft preview</strong>'+
        '<div class="detail-grid">'+
          '<span>Template</span><code>'+esc(payload.workflowTemplateRef)+'</code>'+
          '<span>Resolution</span><strong>'+esc(payload.templateResolution)+'</strong>'+
          '<span>Publish</span><strong>'+String(payload.publishAuthorized)+'</strong>'+
          '<span>Execute</span><strong>'+String(payload.executionAuthorized)+'</strong>'+
        '</div><pre>'+esc(JSON.stringify(payload.draft.canonicalDefinition,null,2))+'</pre>';
      return;
    }

    target.innerHTML=
      '<strong>Simulation preview</strong>'+
      '<div class="detail-grid">'+
        '<span>Execution performed</span><strong>'+String(payload.executionPerformed)+'</strong>'+
        '<span>Draft valid</span><strong>'+String(payload.draftValidation.valid)+'</strong>'+
        '<span>Authority</span><strong>'+esc(payload.authority)+'</strong>'+
      '</div>'+
      '<ul class="compact">'+payload.fixtures.map(fixture=>
        '<li>'+esc(fixture.fixtureId)+' → '+esc(fixture.expectedTerminalState)+' ('+esc(fixture.resultKind)+')</li>'
      ).join('')+'</ul>';
  }catch(error){
    target.innerHTML='<div class="empty">'+esc(error.message)+'</div>';
  }
}

async function load(){
  try{
    const catalog=await api('/api/modules/fh-kuika/blueprints');
    renderCatalog(catalog);
    if(catalog.blueprints[0]) await loadDetail(catalog.blueprints[0].id);
  }catch(error){ document.querySelector('#status').textContent='Catalog unavailable: '+error.message; }
}
void load();
</script>
</body>
</html>`;
