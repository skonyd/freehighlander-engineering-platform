export const OPERATOR_AUTHORITY_PERMISSIONS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeHighlander · Authority permissions</title>
  <style>
    :root { color-scheme:dark; --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#e8eef6; --muted:#93a4b8; --accent:#7dd3fc; --good:#86efac; --warn:#fde68a; --bad:#fca5a5; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top left,#122032 0,var(--bg) 38rem); color:var(--text); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header,main { max-width:980px; margin:auto; padding:24px; }
    header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
    h1 { margin:0; font-size:26px; }
    h2 { margin:0 0 6px; font-size:16px; }
    a { color:var(--accent); text-decoration:none; }
    .muted { color:var(--muted); }
    .notice { border:1px solid #5b4a22; background:#1d190f; border-radius:12px; padding:14px; margin-bottom:14px; }
    .grid { display:grid; gap:12px; }
    .permission { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:start; border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:16px; }
    .permission input { width:20px; height:20px; margin-top:2px; }
    .benefit { color:var(--good); }
    .risk { color:var(--warn); }
    .cap-status { display:inline-block; margin-top:8px; padding:2px 8px; border:1px solid var(--line); border-radius:999px; font-size:12px; }
    .cap-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    button { background:#162433; color:var(--text); border:1px solid #31506b; border-radius:9px; padding:8px 11px; cursor:pointer; }
    button:hover,button:focus-visible { border-color:var(--accent); outline:none; }
    button:disabled { opacity:.45; cursor:not-allowed; }
    pre { overflow:auto; background:#080b0f; border:1px solid var(--line); border-radius:10px; padding:12px; min-height:110px; }
    .status { margin:12px 0; color:var(--muted); }
    .error { color:var(--bad); }
  </style>
</head>
<body>
<header>
  <div>
    <div class="muted">FreeHighlander · Security / Authority</div>
    <h1>Operator authority permissions</h1>
    <div class="muted">Persistent capability state is owned by the local control-plane.</div>
  </div>
  <a href="/">← Dashboard</a>
</header>
<main>
  <div class="notice">
    <strong>Safe default:</strong> all critical permissions are DENY. Selecting a capability records operator intent only.
    Activation still requires an explicit human approval and the current SYSTEM_POLICY gate.
  </div>

  <section class="grid" aria-label="Authority permissions">
    <article class="permission" data-capability="GIT_WRITE">
      <input id="gitWrite" type="checkbox" aria-label="Request Code / Git" />
      <div>
        <h2>Code / Git</h2>
        <div class="benefit">Automatic branch, commit, PR and policy-permitted merge workflows.</div>
        <div class="risk">Can mutate repository state.</div>
        <span class="cap-status" data-status>Loading…</span>
        <div class="cap-actions">
          <button type="button" data-activate>Approve &amp; activate</button>
          <button type="button" data-disable>Disable</button>
        </div>
      </div>
    </article>

    <article class="permission" data-capability="RELEASE_DEPLOY">
      <input id="releaseDeploy" type="checkbox" aria-label="Request Release / Deploy" />
      <div>
        <h2>Release / Deploy</h2>
        <div class="benefit">Release and deployment can proceed after required gates pass.</div>
        <div class="risk">Can affect a live environment.</div>
        <span class="cap-status" data-status>Loading…</span>
        <div class="cap-actions">
          <button type="button" data-activate>Approve &amp; activate</button>
          <button type="button" data-disable>Disable</button>
        </div>
      </div>
    </article>

    <article class="permission" data-capability="INFRASTRUCTURE_MUTATION">
      <input id="infrastructureMutation" type="checkbox" aria-label="Request Infrastructure" />
      <div>
        <h2>Infrastructure</h2>
        <div class="benefit">Kubernetes, cloud and infrastructure changes can be automated.</div>
        <div class="risk">Highest operational blast radius.</div>
        <span class="cap-status" data-status>Loading…</span>
        <div class="cap-actions">
          <button type="button" data-activate>Approve &amp; activate</button>
          <button type="button" data-disable>Disable</button>
        </div>
      </div>
    </article>

    <article class="permission" data-capability="AUTOMATIC_REMEDIATION">
      <input id="automaticRemediation" type="checkbox" aria-label="Request Automatic remediation" />
      <div>
        <h2>Automatic remediation</h2>
        <div class="benefit">Eligible failures can be repaired without waiting for another operator action.</div>
        <div class="risk">Incorrect diagnosis can trigger an unwanted corrective action.</div>
        <span class="cap-status" data-status>Loading…</span>
        <div class="cap-actions">
          <button type="button" data-activate>Approve &amp; activate</button>
          <button type="button" data-disable>Disable</button>
        </div>
      </div>
    </article>
  </section>

  <div class="actions">
    <button id="refresh" type="button">Refresh state</button>
    <button id="denyAll" type="button">Reset all to DENY</button>
  </div>
  <div id="status" class="status" role="status" aria-live="polite">Connecting to control-plane…</div>
  <pre id="preview">No control-plane state loaded.</pre>
</main>
<script>
const cards=[...document.querySelectorAll('[data-capability]')];
const params=new URLSearchParams(location.search);
const apiBase=params.get('authorityApi')||
  location.protocol+'//'+(location.hostname||'127.0.0.1')+':4311';
let csrfToken=null;
let generation=0;
let authorityState={requestedCapabilities:[],activeCapabilities:[]};
let approvals={};

function status(message,isError=false){
  const node=document.getElementById('status');
  node.textContent=message;
  node.classList.toggle('error',isError);
}

async function readJson(response){
  const body=await response.json();
  if(!response.ok){
    const result=body.result;
    const reasons=result&&Array.isArray(result.reasons)?result.reasons.join('; '):'';
    throw new Error(reasons||body.message||body.error||response.statusText);
  }
  return body;
}

async function ensureSession(){
  if(csrfToken) return;
  const response=await fetch(apiBase+'/v1/authority/session',{cache:'no-store'});
  const body=await readJson(response);
  csrfToken=body.csrfToken;
}

async function loadState(){
  try{
    await ensureSession();
    const body=await readJson(await fetch(apiBase+'/v1/authority',{cache:'no-store'}));
    generation=body.generation;
    authorityState=body.state;
    approvals=body.approvals||{};
    render();
    status('Control-plane state loaded. Generation '+generation+'.');
  }catch(error){
    status('Authority control-plane unavailable: '+error.message,true);
  }
}

function render(){
  const requested=new Set(authorityState.requestedCapabilities||[]);
  const active=new Set(authorityState.activeCapabilities||[]);
  for(const card of cards){
    const capability=card.dataset.capability;
    const checkbox=card.querySelector('input[type=checkbox]');
    const activate=card.querySelector('[data-activate]');
    const disable=card.querySelector('[data-disable]');
    const badge=card.querySelector('[data-status]');
    checkbox.checked=requested.has(capability);
    const isActive=active.has(capability);
    const isRequested=requested.has(capability);
    badge.textContent=isActive?'ACTIVE':isRequested?'REQUESTED · inactive':'DENY';
    activate.disabled=!isRequested||isActive;
    disable.disabled=!isActive;
  }
  document.getElementById('preview').textContent=JSON.stringify({
    generation,
    state:authorityState,
    approvals
  },null,2);
}

async function mutate(path,payload){
  await ensureSession();
  const response=await fetch(apiBase+path,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-freehighlander-csrf':csrfToken
    },
    body:JSON.stringify(payload)
  });
  return readJson(response);
}

async function setRequested(capability,requested){
  const body=await mutate('/v1/authority/request',{
    capability,
    requested,
    expectedGeneration:generation
  });
  generation=body.result.generation;
  authorityState=body.result.state;
  render();
}

async function approveAndActivate(capability){
  if(!confirm('Approve and activate '+capability+' for the current exact revision?')) return;
  status('Creating exact human approval for '+capability+'…');
  await mutate('/v1/authority/approve',{capability,expectedGeneration:generation});
  const body=await mutate('/v1/authority/activate',{capability,expectedGeneration:generation});
  generation=body.result.generation;
  authorityState=body.result.state;
  await loadState();
}

async function disableCapability(capability){
  if(!confirm('Disable '+capability+' immediately?')) return;
  const body=await mutate('/v1/authority/deactivate',{capability,expectedGeneration:generation});
  generation=body.result.generation;
  authorityState=body.result.state;
  await loadState();
}

for(const card of cards){
  const capability=card.dataset.capability;
  const checkbox=card.querySelector('input[type=checkbox]');
  checkbox.addEventListener('change',async()=>{
    const requested=checkbox.checked;
    if(!requested&&authorityState.activeCapabilities.includes(capability)){
      if(!confirm('This will also deactivate '+capability+'. Continue?')){
        checkbox.checked=true;
        return;
      }
    }
    try{
      await setRequested(capability,requested);
      status(requested?capability+' requested. Activation is still gated.':capability+' reset to DENY.');
    }catch(error){
      status('Unable to update '+capability+': '+error.message,true);
      await loadState();
    }
  });
  card.querySelector('[data-activate]').addEventListener('click',async()=>{
    try{
      await approveAndActivate(capability);
    }catch(error){
      status('Activation blocked for '+capability+': '+error.message,true);
      await loadState();
    }
  });
  card.querySelector('[data-disable]').addEventListener('click',async()=>{
    try{
      await disableCapability(capability);
    }catch(error){
      status('Unable to disable '+capability+': '+error.message,true);
      await loadState();
    }
  });
}

document.getElementById('refresh').addEventListener('click',()=>void loadState());
document.getElementById('denyAll').addEventListener('click',async()=>{
  if(!confirm('Reset every requested capability to DENY?')) return;
  try{
    for(const capability of [...authorityState.requestedCapabilities]){
      await setRequested(capability,false);
    }
    status('All critical capabilities are DENY.');
    await loadState();
  }catch(error){
    status('Reset to DENY was interrupted: '+error.message,true);
    await loadState();
  }
});

void loadState();
</script>
</body>
</html>`;
