const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/cron', label: 'Cron' },
  { path: '/settings', label: 'Settings' },
  { path: '/part-types', label: 'Part Types' },
  { path: '/routings', label: 'Routings' },
  { path: '/operations', label: 'Operations' },
  { path: '/priorities', label: 'Priorities' },
  { path: '/effort', label: 'Effort' },
  { path: '/releases', label: 'Releases' },
  { path: '/resources', label: 'Resources' },
  { path: '/runs', label: 'Runs' },
];

export function layout(title: string, activePath: string, body: string): string {
  const nav = NAV_ITEMS.map(
    item =>
      `<a href="${item.path}" class="${item.path === activePath ? 'active' : ''}">${item.label}</a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - Jira Integration</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#f5f7fa}
nav{background:#1e293b;color:#fff;padding:0 1rem;display:flex;align-items:center;height:52px;gap:0;overflow-x:auto}
nav .brand{font-weight:700;font-size:15px;margin-right:1.5rem;white-space:nowrap;color:#60a5fa}
nav a{color:#94a3b8;text-decoration:none;padding:0.9rem 0.75rem;font-size:13px;white-space:nowrap;border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
nav a:hover{color:#e2e8f0}
nav a.active{color:#fff;border-bottom-color:#3b82f6}
.container{max-width:1200px;margin:1.5rem auto;padding:0 1rem}
h1{font-size:20px;font-weight:600;margin-bottom:1rem;color:#0f172a}
h2{font-size:16px;font-weight:600;margin-bottom:0.75rem;color:#334155}
.card{background:#fff;border-radius:8px;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th{background:#f8fafc;text-align:left;padding:0.6rem 0.75rem;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:#64748b;border-bottom:2px solid #e2e8f0}
td{padding:0.6rem 0.75rem;border-bottom:1px solid #f1f5f9;font-size:13px}
tr:hover td{background:#f8fafc}
.btn{padding:0.4rem 0.85rem;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-primary{background:#3b82f6;color:#fff}
.btn-success{background:#16a34a;color:#fff}
.btn-danger{background:#ef4444;color:#fff}
.btn-outline{background:transparent;border:1px solid #d1d5db;color:#374151}
.btn-sm{padding:0.25rem 0.5rem;font-size:12px}
input,select,textarea{padding:0.4rem 0.6rem;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}
.form-row{display:flex;gap:0.75rem;align-items:center;margin-bottom:0.75rem;flex-wrap:wrap}
.form-row label{font-size:12px;font-weight:600;color:#475569;min-width:100px}
.form-row input,.form-row select{flex:1;min-width:120px}
.badge{display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:11px;font-weight:600}
.badge-ok{background:#dcfce7;color:#166534}
.badge-error{background:#fef2f2;color:#991b1b}
.badge-running{background:#fef9c3;color:#854d0e}
.badge-yes{background:#dbeafe;color:#1e40af}
.badge-no{background:#f1f5f9;color:#64748b}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1rem}
.stat-card{background:#fff;border-radius:8px;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
.stat-value{font-size:28px;font-weight:700;color:#0f172a}
.stat-label{font-size:12px;color:#64748b;margin-top:0.25rem}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;padding:0.75rem 1.25rem;border-radius:8px;color:#fff;font-size:13px;z-index:1000;animation:fadeIn .2s}
.toast-ok{background:#16a34a}
.toast-error{background:#dc2626}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.empty{text-align:center;padding:2rem;color:#94a3b8;font-size:14px}
.mono{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
</style>
</head><body>
<nav>
<span class="brand">Jira Integration</span>
${nav}
</nav>
<div class="container">
${body}
</div>
<script>
function showToast(msg,type='ok'){const t=document.createElement('div');t.className='toast toast-'+type;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}
async function api(path,opts={}){const r=await fetch('/api/'+path,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||r.statusText);return d}
async function apiPost(path,body){return api(path,{method:'POST',body:JSON.stringify(body)})}
async function apiPut(path,body){return api(path,{method:'PUT',body:JSON.stringify(body)})}
async function apiDelete(path){return api(path,{method:'DELETE'})}
</script>
</body></html>`;
}
