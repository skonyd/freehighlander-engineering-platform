import {
  AUTHORITY_CAPABILITY_IDS,
  AUTHORITY_CAPABILITY_REGISTRY_V1,
  B_LANE_MODULE_REGISTRY_V1,
} from '@freehighlander/contracts';

const AUTHORITY_PERMISSION_CARDS = AUTHORITY_CAPABILITY_REGISTRY_V1.map(
  (definition) => `
    <article class="permission" data-capability="${definition.id}">
      <div class="permission-head">
        <input id="request-${definition.id}" type="checkbox" aria-label="Request ${escapeAuthorityHtml(definition.label)} authority" />
        <div><h2>${escapeAuthorityHtml(definition.label)}</h2><div class="benefit">${escapeAuthorityHtml(definition.description)}</div><div class="risk">${escapeAuthorityHtml(definition.risk)}</div></div>
        <span class="state deny" id="state-${definition.id}">DENY</span>
      </div>
      <div class="cap-actions"><button data-approve="${definition.id}">Approve & activate</button><button data-deactivate="${definition.id}" class="danger">Deactivate</button></div>
    </article>`,
).join('\n');

const AUTHORITY_CAPABILITY_IDS_JSON = JSON.stringify(AUTHORITY_CAPABILITY_IDS);
const B_LANE_MODULE_CARDS = B_LANE_MODULE_REGISTRY_V1.map(
  (definition) => `
    <article class="permission module" data-module="${definition.id}">
      <div class="permission-head">
        <div></div>
        <div><h2>${escapeAuthorityHtml(definition.id + ' · ' + definition.label)}</h2><div class="muted">${escapeAuthorityHtml(definition.description)}</div><div class="risk">Required: ${escapeAuthorityHtml(definition.requiredCapabilities.join(', ') || 'none · evidence-only')}</div>${definition.conditionalCapabilities.length > 0 ? `<div class="muted">Conditional: ${escapeAuthorityHtml(definition.conditionalCapabilities.join(', '))}</div>` : ''}</div>
        <span class="state deny" id="module-state-${definition.id}">READY / DENY</span>
      </div>
    </article>`,
).join('\n');

const B_LANE_MODULES_JSON = JSON.stringify(B_LANE_MODULE_REGISTRY_V1);


export const OPERATOR_AUTHORITY_PERMISSIONS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · Authority permissions</title>
  <style>
    :root { color-scheme:dark; --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac; --warn:#fde68a; --bad:#fca5a5; --off:#64748b; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header,main { max-width:1040px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:26px; }
    h2 { margin:0 0 6px; font-size:16px; }
    a { color:var(--accent); text-decoration:none; }
    .muted { color:var(--muted); }
    .notice { border:1px solid #5b4a22; background:#1d190f; border-radius:12px; padding:14px; margin-bottom:14px; }
    .connection { border:1px solid var(--line); background:var(--panel); border-radius:12px; padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .grid { display:grid; gap:12px; }
    .permission { border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:16px; }
    .permission-head { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:start; }
    .permission input { width:20px; height:20px; margin-top:2px; }
    .benefit { color:var(--good); }
    .risk { color:var(--warn); }
    .bad { color:var(--bad); }
    .state { border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; color:var(--muted); white-space:nowrap; }
    .state.active { color:var(--good); border-color:#2c6b43; }
    .state.requested { color:var(--warn); border-color:#6b5a2c; }
    .state.deny { color:var(--off); }
    .cap-actions,.actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
    .actions { margin-top:16px; }
    button { background:#162433; color:var(--text); border:1px solid #31506b; border-radius:9px; padding:9px 12px; cursor:pointer; }
    button:hover,button:focus-visible { border-color:var(--accent); outline:none; }
    button:disabled { opacity:.45; cursor:not-allowed; }
    button.danger { border-color:#6b3030; }
    code { color:var(--accent); }
    pre { overflow:auto; background:#080b0f; border:1px solid var(--line); border-radius:10px; padding:12px; min-height:110px; }
    .status { margin-top:10px; color:var(--muted); }
  </style>
</head>
<body>
<header>
  <div>
    <div class="muted">FreeHighlander · Security / Authority</div>
    <h1>Operator authority permissions</h1>
    <div class="muted">Select capability intent here; the control-plane performs approval, policy binding and activation.</div>
  </div>
  <a href="/">← Core Home</a>
</header>
<main>
  <div class="notice">
    <strong>Safe default:</strong> all four critical capabilities remain DENY until explicitly requested and approved.
    Browser state is not authority evidence. The UI cannot submit approval hashes, policy hashes, or a trusted verification flag.
  </div>

  <div class="connection">
    <span>Control-plane: <code id="endpoint">http://127.0.0.1:4311</code></span>
    <span id="connection">Connecting…</span>
  </div>

  <section class="grid" aria-label="Authority permissions">\n${AUTHORITY_PERMISSION_CARDS}\n  </section>

  <h2 style="margin-top:24px">B-lane module status</h2>
  <div class="muted">Implementation readiness is separate from runtime authority. OPERATIONAL does not mean ACTIVE.</div>
  <section class="grid" aria-label="B-lane modules">\n${B_LANE_MODULE_CARDS}\n  </section>

  <div class="actions">
    <button id="apply" type="button">Apply requested selection</button>
    <button id="refresh" type="button">Refresh runtime state</button>
    <button id="deny-all" type="button" class="danger">Reset all to DENY</button>
  </div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <pre id="preview">Waiting for control-plane state…</pre>
</main>
<script>
const API='http://127.0.0.1:4311';
const capabilities=${AUTHORITY_CAPABILITY_IDS_JSON};
const bLaneModules=${B_LANE_MODULES_JSON};
let csrfToken='';
let snapshot=null;
let busy=false;

const byId=id=>document.getElementById(id);
const requested=capability=>snapshot && snapshot.state.requestedCapabilities.includes(capability);
const active=capability=>snapshot && snapshot.state.activeCapabilities.includes(capability);

function setBusy(value){
  busy=value;
  for(const button of document.querySelectorAll('button')) button.disabled=value;
  for(const input of document.querySelectorAll('input[type=checkbox]')) input.disabled=value;
}

function showStatus(message,isError=false){
  const el=byId('status');
  el.textContent=message;
  el.className='status'+(isError?' bad':'');
}

async function readJson(response){
  const body=await response.json();
  if(!response.ok){
    const message=body.message||body.error||(body.result&&body.result.reasons&&body.result.reasons.join('; '))||response.statusText;
    throw new Error(message);
  }
  return body;
}

async function loadSession(){
  const response=await fetch(API+'/v1/authority/session',{cache:'no-store'});
  const body=await readJson(response);
  csrfToken=body.csrfToken;
}

async function loadSnapshot(){
  const response=await fetch(API+'/v1/authority',{cache:'no-store'});
  snapshot=await readJson(response);
  render();
}

async function refresh(){
  setBusy(true);
  try{
    await Promise.all([loadSession(),loadSnapshot()]);
    byId('connection').textContent='Connected · generation '+snapshot.generation;
    showStatus('Runtime authority state loaded from the control-plane.');
  }catch(error){
    csrfToken='';
    snapshot=null;
    byId('connection').textContent='Offline / unavailable';
    showStatus('Authority control-plane unavailable: '+error.message,true);
    byId('preview').textContent='Start it with: npm run authority:start';
  }finally{
    setBusy(false);
  }
}

function render(){
  if(!snapshot) return;
  for(const capability of capabilities){
    const checkbox=byId('request-'+capability);
    checkbox.checked=requested(capability);
    const state=byId('state-'+capability);
    if(active(capability)){
      state.textContent='ACTIVE';
      state.className='state active';
    }else if(requested(capability)){
      state.textContent='REQUESTED';
      state.className='state requested';
    }else{
      state.textContent='DENY';
      state.className='state deny';
    }
    const approve=document.querySelector('[data-approve="'+capability+'"]');
    const deactivate=document.querySelector('[data-deactivate="'+capability+'"]');
    approve.disabled=busy||!requested(capability)||active(capability);
    deactivate.disabled=busy||!active(capability);
  }
  for(const module of bLaneModules){
    const state=byId('module-state-'+module.id);
    const requiredActive=module.requiredCapabilities.every(capability=>active(capability));
    if(module.requiredCapabilities.length===0){
      state.textContent='OPERATIONAL · NO AUTHORITY';
      state.className='state active';
    }else if(requiredActive){
      state.textContent='OPERATIONAL · CAPABILITY ACTIVE';
      state.className='state active';
    }else{
      state.textContent='OPERATIONAL · READY / DENY';
      state.className='state requested';
    }
  }
  byId('preview').textContent=JSON.stringify(snapshot,null,2);
}

async function mutate(path,body){
  if(!csrfToken) throw new Error('No control-plane session token');
  const response=await fetch(API+path,{
    method:'POST',
    headers:{'content-type':'application/json','x-freehighlander-csrf':csrfToken},
    body:JSON.stringify(body),
  });
  const payload=await response.json();
  if(!response.ok){
    const reason=payload.result&&payload.result.reasons?payload.result.reasons.join('; '):payload.message||payload.error||response.statusText;
    throw new Error(reason);
  }
  return payload.result;
}

async function applySelection(){
  if(!snapshot) return refresh();
  setBusy(true);
  try{
    let generation=snapshot.generation;
    for(const capability of capabilities){
      const selected=byId('request-'+capability).checked;
      if(selected!==requested(capability)){
        const result=await mutate('/v1/authority/request',{
          capability,
          requested:selected,
          expectedGeneration:generation,
        });
        generation=result.generation;
        snapshot={...snapshot,generation,state:result.state};
      }
    }
    await loadSnapshot();
    showStatus('Requested capability selection applied. Requested is not the same as active authority.');
  }catch(error){
    showStatus('Unable to apply selection: '+error.message,true);
    await loadSnapshot().catch(()=>{});
  }finally{
    setBusy(false);
    render();
  }
}

async function approveAndActivate(capability){
  if(!snapshot||!requested(capability)||active(capability)) return;
  setBusy(true);
  try{
    const generation=snapshot.generation;
    await mutate('/v1/authority/approve',{capability,expectedGeneration:generation});
    await mutate('/v1/authority/activate',{capability,expectedGeneration:generation});
    await loadSnapshot();
    showStatus(capability+' explicitly approved and activated for the current exact state.');
  }catch(error){
    showStatus('Activation blocked: '+error.message,true);
    await loadSnapshot().catch(()=>{});
  }finally{
    setBusy(false);
    render();
  }
}

async function deactivate(capability){
  if(!snapshot||!active(capability)) return;
  setBusy(true);
  try{
    await mutate('/v1/authority/deactivate',{
      capability,
      expectedGeneration:snapshot.generation,
    });
    await loadSnapshot();
    showStatus(capability+' deactivated.');
  }catch(error){
    showStatus('Unable to deactivate: '+error.message,true);
    await loadSnapshot().catch(()=>{});
  }finally{
    setBusy(false);
    render();
  }
}

async function denyAll(){
  if(!snapshot) return refresh();
  setBusy(true);
  try{
    let generation=snapshot.generation;
    for(const capability of capabilities){
      if(requested(capability)){
        const result=await mutate('/v1/authority/request',{
          capability,
          requested:false,
          expectedGeneration:generation,
        });
        generation=result.generation;
        snapshot={...snapshot,generation,state:result.state};
      }
    }
    await loadSnapshot();
    showStatus('All critical capabilities reset to DENY.');
  }catch(error){
    showStatus('Unable to reset all capabilities: '+error.message,true);
    await loadSnapshot().catch(()=>{});
  }finally{
    setBusy(false);
    render();
  }
}

byId('apply').addEventListener('click',()=>void applySelection());
byId('refresh').addEventListener('click',()=>void refresh());
byId('deny-all').addEventListener('click',()=>void denyAll());
for(const button of document.querySelectorAll('[data-approve]')){
  button.addEventListener('click',()=>void approveAndActivate(button.dataset.approve));
}
for(const button of document.querySelectorAll('[data-deactivate]')){
  button.addEventListener('click',()=>void deactivate(button.dataset.deactivate));
}
void refresh();
</script>
</body>
</html>`;

export function authorityPermissionsPageCanForgeApprovalEvidence(): false {
  return false;
}

export function authorityPermissionsPageRequiresControlPlane(): true {
  return true;
}

function escapeAuthorityHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
