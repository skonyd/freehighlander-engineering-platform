export const FH_KUIKA_WORKBENCH_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · FH-KUIKA Workbench</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#0b0f14; --panel:#121821; --panel2:#171f2a; --line:#263241;
      --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --warn:#fde68a;
    }
    * { box-sizing:border-box; }
    body {
      margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem);
      color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    header,main { max-width:1180px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:25px; }
    h2 { margin:0 0 10px; font-size:16px; }
    a { color:var(--accent); text-decoration:none; }
    a:hover,a:focus-visible { text-decoration:underline; }
    .eyebrow { color:var(--accent); text-transform:uppercase; font-size:11px; letter-spacing:.14em; font-weight:700; }
    .muted { color:var(--muted); }
    .layout { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr); gap:14px; }
    .card { background:color-mix(in srgb,var(--panel) 92%,transparent); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .modes { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    button {
      background:var(--panel2); color:var(--text); border:1px solid var(--line);
      border-radius:8px; padding:8px 12px; cursor:pointer;
    }
    button[aria-selected="true"] { border-color:var(--accent); color:var(--accent); }
    button:focus-visible,input:focus-visible,textarea:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    textarea,input {
      width:100%; background:#090d12; color:var(--text);
      border:1px solid var(--line); border-radius:9px; padding:12px; font:inherit;
    }
    textarea { min-height:180px; resize:vertical; }
    .field { display:grid; gap:5px; margin-top:12px; }
    .field label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .mode-note { margin:10px 0 14px; color:var(--muted); min-height:42px; }
    .context-chips { display:flex; flex-wrap:wrap; gap:8px; }
    .context-chip {
      display:inline-flex; flex-direction:column; gap:2px; max-width:100%;
      border:1px solid var(--line); background:#0d131b; border-radius:9px; padding:7px 9px;
    }
    .context-chip span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
    .context-chip strong,.context-chip code { overflow-wrap:anywhere; }
    .context-chip.authoritative { border-color:#315d74; }
    .preflight-row { display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-top:1px solid var(--line); }
    .preflight-row:first-child { border-top:0; }
    .preflight-row span { color:var(--muted); }
    .preflight { margin-top:14px; border-top:1px solid var(--line); padding-top:12px; }
    .pill { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:11px; }
    .warn { color:var(--warn); }
    .action {
      margin-top:12px; display:flex; justify-content:space-between; gap:10px; align-items:center;
      padding:10px 12px; background:var(--panel2); border-radius:9px; flex-wrap:wrap;
    }
    .intent-preview {
      margin-top:14px; background:#090d12; border:1px solid var(--line); border-radius:9px;
      padding:12px; white-space:pre-wrap; word-break:break-word; min-height:90px;
    }
    @media (max-width:820px) { .layout { grid-template-columns:1fr; } header { flex-direction:column; } }
    .skip-link { position:absolute; left:-9999px; top:8px; z-index:10; background:var(--panel); color:var(--accent); padding:8px 10px; border-radius:8px; }
    .skip-link:focus { left:8px; }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to workbench</a>
  <header>
    <div>
      <div class="eyebrow">FH-KUIKA · Workbench</div>
      <h1>AI Workbench</h1>
      <div id="status" class="muted" role="status" aria-live="polite">Loading project context…</div>
    </div>
    <a href="/modules/fh-kuika">← FH-KUIKA Overview</a>
  </header>

  <main id="main-content" tabindex="-1">
    <section class="layout">
      <div class="card">
        <div class="modes" role="tablist" aria-label="Workbench mode">
          <button type="button" data-mode="ASK" role="tab" aria-selected="true">Ask</button>
          <button type="button" data-mode="PLAN" role="tab" aria-selected="false">Plan</button>
          <button type="button" data-mode="EXECUTE" role="tab" aria-selected="false">Execute</button>
          <button type="button" data-mode="REVIEW" role="tab" aria-selected="false">Review</button>
        </div>

        <h2 id="mode-title">Ask</h2>
        <div id="mode-note" class="mode-note">Read-only project and engineering questions.</div>

        <textarea id="prompt" aria-label="Workbench request" placeholder="Describe the work or question…"></textarea>

        <div class="field">
          <label for="evidence-ids">Evidence IDs · required for Review</label>
          <input id="evidence-ids" type="text" placeholder="evidence-123, evidence-456" />
        </div>

        <div class="action">
          <span id="action-status" class="muted">Mode selection performs no model call.</span>
          <span class="pill">NO MODEL CALL ON SELECT</span>
          <button id="prepare-intent" type="button">Prepare intent</button>
        </div>

        <div class="muted" style="margin-top:12px">Prepared intent preview · no model call</div>
        <pre id="intent-preview" class="intent-preview">Nothing prepared yet.</pre>
      </div>

      <aside class="card">
        <h2>Context</h2>
        <div id="context" class="context-chips">
          <div class="context-chip"><span>Context</span><strong>Loading…</strong></div>
        </div>
        <div class="preflight">
          <h2>Preflight</h2>
          <div id="preflight" class="muted">Loading authority state…</div>
        </div>
      </aside>
    </section>
  </main>

<script>
const modeViews={
  ASK:{title:'Ask',purpose:'Read-only project and engineering questions.'},
  PLAN:{title:'Plan',purpose:'Produce candidate plans and structured engineering work proposals.'},
  EXECUTE:{title:'Execute',purpose:'Request a bounded writer workflow through normal control-plane policy.'},
  REVIEW:{title:'Review',purpose:'Request independent review bound to an exact revision and evidence set.'}
};
const MODE_KEY='fh-kuika-workbench-mode-v1';
let activeMode='ASK';
let snapshotState=null;

const esc=value=>String(value??'—').replace(
  /[&<>"']/g,
  ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
);

async function api(path){
  const response=await fetch(path,{cache:'no-store'});
  const body=await response.json();
  if(!response.ok) throw new Error(body.message||body.error||response.statusText);
  return body;
}

async function selectMode(mode){
  activeMode=mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  const view=modeViews[mode];
  document.querySelectorAll('button[data-mode]').forEach(button=>
    button.setAttribute('aria-selected',String(button.dataset.mode===mode))
  );
  document.querySelector('#mode-title').textContent=view.title;
  document.querySelector('#mode-note').textContent=view.purpose;
  document.querySelector('#action-status').textContent='Checking deterministic preflight…';

  try{
    const snapshot=await api('/api/modules/fh-kuika/workbench?mode='+encodeURIComponent(mode));
    if(activeMode!==mode) return;
    snapshotState=snapshot;
    renderSnapshot(snapshot);
  }catch(error){
    document.querySelector('#action-status').innerHTML=
      '<span class="warn">Preflight unavailable: '+esc(error.message)+'</span>';
  }
}

function renderSnapshot(snapshot){
  const context=snapshot.context||[];
  document.querySelector('#status').textContent=
    'Preparation surface · authority '+(snapshot.preflight?.v3Authority||'UNKNOWN')+
    ' · source '+(snapshot.preflight?.sourceState||'UNKNOWN');

  document.querySelector('#context').innerHTML=context.length
    ? context.map(item=>
        '<div class="context-chip'+(item.authoritative?' authoritative':'')+'">'+
          '<span>'+esc(item.label)+'</span>'+
          (item.kind==='EXACT_REVISION'
            ? '<code>'+esc(String(item.value).slice(0,12))+'</code>'
            : '<strong>'+esc(item.value)+'</strong>')+
        '</div>'
      ).join('')
    : '<div class="muted">No deterministic project context is available.</div>';

  const preflight=snapshot.preflight;
  document.querySelector('#preflight').innerHTML=
    '<div class="preflight-row"><span>Selection authority</span><strong>'+esc(preflight.selectionAuthority)+'</strong></div>'+
    '<div class="preflight-row"><span>Execution owner</span><strong>'+esc(preflight.executionOwner)+'</strong></div>'+
    '<div class="preflight-row"><span>V3 authority</span><strong>'+esc(preflight.v3Authority)+'</strong></div>'+
    '<div class="preflight-row"><span>Exact revision</span><strong>'+(preflight.exactRevisionBound?'BOUND':'MISSING')+'</strong></div>'+
    '<div class="preflight-row"><span>Source state</span><strong>'+esc(preflight.sourceState)+'</strong></div>';

  document.querySelector('#action-status').innerHTML=preflight.canStartRequest
    ? 'Preflight passed. Preparing an intent still performs no model or runtime call.'
    : '<span class="warn">'+esc(preflight.blockedReason||'Request is blocked.')+'</span>';
}

function contextValue(kind){
  return snapshotState?.context?.find(item=>item.kind===kind)?.value||null;
}

function prepareIntent(){
  const preview=document.querySelector('#intent-preview');
  const request=document.querySelector('#prompt').value.trim();
  const evidenceIds=document.querySelector('#evidence-ids').value
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean);
  const preflight=snapshotState?.preflight;

  if(!request){preview.textContent='Request is required.';return;}
  if(!snapshotState||!preflight){preview.textContent='Deterministic preflight is unavailable.';return;}
  if(activeMode==='EXECUTE'&&!preflight.canStartRequest){
    preview.textContent='EXECUTE blocked: '+(preflight.blockedReason||'authority requirement not met.');
    return;
  }
  if(activeMode==='REVIEW'&&!preflight.exactRevisionBound){
    preview.textContent='REVIEW blocked: exact revision is unavailable.';
    return;
  }
  if(activeMode==='REVIEW'&&evidenceIds.length===0){
    preview.textContent='REVIEW blocked: at least one evidence ID is required.';
    return;
  }

  const disposition={
    ASK:'READ_ONLY_QUERY',
    PLAN:'CANDIDATE_PLAN',
    EXECUTE:'CONTROL_PLANE_REQUEST',
    REVIEW:'INDEPENDENT_REVIEW_REQUEST'
  }[activeMode];

  preview.textContent=JSON.stringify({
    schemaVersion:1,
    mode:activeMode,
    disposition,
    request,
    context:{
      repository:contextValue('REPOSITORY'),
      branch:contextValue('BRANCH'),
      exactRevision:contextValue('EXACT_REVISION'),
      selectedFiles:[],
      evidenceIds,
      blueprintId:null,
      workflowId:contextValue('WORKFLOW')
    },
    selectionAuthority:'NONE',
    executionOwner:'CONTROL_PLANE',
    canInvokeModelOnPrepare:false,
    canGrantAuthority:false,
    mutationRequested:activeMode==='EXECUTE',
    requiresEnabledV3Authority:activeMode==='EXECUTE'
  },null,2);
}

document.querySelectorAll('button[data-mode]').forEach(button=>
  button.addEventListener('click',()=>void selectMode(button.dataset.mode))
);
document.querySelector('#prepare-intent').addEventListener('click',prepareIntent);
let initialMode='ASK';
try {
  const savedMode=localStorage.getItem(MODE_KEY);
  if(['ASK','PLAN','EXECUTE','REVIEW'].includes(savedMode)) initialMode=savedMode;
} catch {}
void selectMode(initialMode);
</script>
</body>
</html>`;
