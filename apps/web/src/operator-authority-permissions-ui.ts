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
    .permission { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:start; border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:16px; cursor:pointer; }
    .permission input { width:20px; height:20px; margin-top:2px; }
    .benefit { color:var(--good); }
    .risk { color:var(--warn); }
    .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    button { background:#162433; color:var(--text); border:1px solid #31506b; border-radius:9px; padding:9px 12px; cursor:pointer; }
    button:hover,button:focus-visible { border-color:var(--accent); outline:none; }
    pre { overflow:auto; background:#080b0f; border:1px solid var(--line); border-radius:10px; padding:12px; min-height:110px; }
    .status { margin-top:10px; color:var(--muted); }
  </style>
</head>
<body>
<header>
  <div>
    <div class="muted">FreeHighlander · Security / Authority</div>
    <h1>Operator authority permissions</h1>
    <div class="muted">Choose only the powers you want the control-plane to be allowed to activate.</div>
  </div>
  <a href="/modules/fh-kuika">← Back</a>
</header>
<main>
  <div class="notice">
    <strong>Safe default:</strong> all permissions are DENY unless selected. A checkbox is a human selection only;
    it does not bypass V3 cutover, exact approval, or SYSTEM_POLICY.
  </div>

  <section class="grid" aria-label="Authority permissions">
    <label class="permission">
      <input id="gitWrite" type="checkbox" />
      <span><h2>Code / Git</h2><div class="benefit">Benefit: automatic branch, commit, PR and policy-permitted merge workflows.</div><div class="risk">Risk: repository state can change without a separate manual Git action.</div></span>
    </label>
    <label class="permission">
      <input id="releaseDeploy" type="checkbox" />
      <span><h2>Release / Deploy</h2><div class="benefit">Benefit: release and deployment can proceed after required tests and gates pass.</div><div class="risk">Risk: a bad release can affect a live environment; policy gates still apply.</div></span>
    </label>
    <label class="permission">
      <input id="infrastructureMutation" type="checkbox" />
      <span><h2>Infrastructure</h2><div class="benefit">Benefit: Kubernetes/cloud/infrastructure changes can be automated.</div><div class="risk">Risk: highest operational blast radius; should be enabled only when needed.</div></span>
    </label>
    <label class="permission">
      <input id="automaticRemediation" type="checkbox" />
      <span><h2>Automatic remediation</h2><div class="benefit">Benefit: eligible failures can be repaired without waiting for a human.</div><div class="risk">Risk: an incorrect diagnosis can trigger an unwanted corrective action; safety policy remains mandatory.</div></span>
    </label>
  </section>

  <div class="actions">
    <button id="review" type="button">Review selection</button>
    <button id="save" type="button">Save browser preference</button>
    <button id="clear" type="button">Reset to DENY</button>
  </div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <pre id="preview">No permission selected.</pre>
</main>
<script>
const KEY='freehighlander-authority-selection-v1';
const ids=['gitWrite','releaseDeploy','infrastructureMutation','automaticRemediation'];
const query=()=>ids.map(id=>id+'='+String(document.getElementById(id).checked)).join('&');

function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
    for(const id of ids) document.getElementById(id).checked=saved[id]===true;
  }catch{}
}
function snapshot(){
  return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).checked]));
}
async function review(){
  const status=document.getElementById('status');
  try{
    const response=await fetch('/api/authority-permissions/preview?'+query(),{cache:'no-store'});
    const body=await response.json();
    if(!response.ok) throw new Error(body.message||body.error||response.statusText);
    document.getElementById('preview').textContent=JSON.stringify(body,null,2);
    status.textContent=body.profile.requestedCapabilities.length
      ? 'Selection prepared. It is still policy-gated and not active.'
      : 'No permissions requested; default DENY remains in force.';
  }catch(error){
    status.textContent='Unable to preview selection: '+error.message;
  }
}
document.getElementById('review').addEventListener('click',()=>void review());
document.getElementById('save').addEventListener('click',()=>{
  localStorage.setItem(KEY,JSON.stringify(snapshot()));
  document.getElementById('status').textContent='Browser preference saved. This does not enable authority.';
  void review();
});
document.getElementById('clear').addEventListener('click',()=>{
  for(const id of ids) document.getElementById(id).checked=false;
  localStorage.removeItem(KEY);
  document.getElementById('status').textContent='Reset to default DENY.';
  void review();
});
restore();
void review();
</script>
</body>
</html>`;
