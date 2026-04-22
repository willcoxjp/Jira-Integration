import type { Env } from '../../types';
import { layout } from '../layout';
import { formatScheduleSummary, type CronScheduleConfig } from '../../utils/cron-schedule';

export async function dashboardPage(env: Env): Promise<string> {
  // Get last run
  const lastRun = await env.DB
    .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1")
    .first<any>();

  // Get sync stats
  const syncCount = await env.DB
    .prepare("SELECT COUNT(*) as total FROM order_sync_state")
    .first<{ total: number }>();

  const openCount = await env.DB
    .prepare("SELECT COUNT(*) as total FROM order_sync_state WHERE was_closed = 0")
    .first<{ total: number }>();

  // Cron schedule summary
  const cronRows = await env.DB
    .prepare("SELECT key, value FROM settings WHERE key IN ('cron_enabled','cron_timezone','cron_days','cron_hour','cron_minute')")
    .all<{ key: string; value: string }>();
  const cronS: Record<string, string> = {};
  for (const r of cronRows.results) cronS[r.key] = r.value;
  const cronConfig: CronScheduleConfig = {
    enabled:  cronS.cron_enabled !== 'false',
    timezone: cronS.cron_timezone ?? 'America/New_York',
    days:     (cronS.cron_days ?? '1,2,3,4,5').split(',').map(Number),
    hour:     parseInt(cronS.cron_hour ?? '6', 10),
    minute:   parseInt(cronS.cron_minute ?? '0', 10),
  };
  const cronSummary = formatScheduleSummary(cronConfig);

  // Recent runs
  const recentRuns = await env.DB
    .prepare("SELECT id, trigger_type, started_at, finished_at, status, stats_json FROM runs ORDER BY id DESC LIMIT 10")
    .all();

  let stats: any = {};
  try { stats = JSON.parse(lastRun?.stats_json || '{}'); } catch {}

  const statusBadge = (s: string) => {
    if (s === 'ok') return '<span class="badge badge-ok">OK</span>';
    if (s === 'dry_run') return '<span class="badge badge-ok">Dry Run</span>';
    if (s === 'error') return '<span class="badge badge-error">Error</span>';
    if (s === 'running') return '<span class="badge badge-running">Running</span>';
    return `<span class="badge badge-ok">${s}</span>`;
  };

  const body = `
<h1>Dashboard</h1>

<div class="stats">
  <div class="stat-card">
    <div class="stat-value">${syncCount?.total ?? 0}</div>
    <div class="stat-label">Total Orders Tracked</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${openCount?.total ?? 0}</div>
    <div class="stat-label">Open Orders</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${stats.workOrders ?? '-'}</div>
    <div class="stat-label">Last Run: Work Orders</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${stats.commands ?? '-'}</div>
    <div class="stat-label">Last Run: Commands</div>
  </div>
</div>

<div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
    <div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:2px">Cron Schedule</div>
      <div style="font-size:14px;font-weight:600;color:#0f172a">${cronSummary}</div>
    </div>
    <div style="display:flex;align-items:center;gap:0.75rem">
      <span class="badge ${cronConfig.enabled ? 'badge-ok' : 'badge-error'}">${cronConfig.enabled ? 'Enabled' : 'Disabled'}</span>
      <a href="/cron" class="btn btn-outline btn-sm">Manage</a>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header">
    <h2>Pipeline</h2>
    <button class="btn btn-outline" onclick="triggerPhase('dry_run=true','dryBtn')" id="dryBtn" title="Fetch from Jira, transform, and stage CSVs for review. Nothing is sent to Intuiflow. Required before steps 2–5.">1. Dry Run</button>
    <button class="btn btn-primary" onclick="triggerPhase('phase=wo','woBtn')" id="woBtn" title="Upload the staged work orders CSV to Intuiflow. Uses data from the last Dry Run.">2. Upload WOs</button>
    <button class="btn btn-primary" onclick="triggerPhase('phase=reschedule','schedBtn')" id="schedBtn" title="Trigger the Intuiflow scheduler for the configured location (POST /api/v2/job/scheduling). Run after Upload WOs and before Commands.">3. Reschedule</button>
    <button class="btn btn-primary" onclick="triggerPhase('phase=commands','cmdBtn')" id="cmdBtn" title="Send Release/Close commands to Intuiflow for orders whose status changed since the last sync. Uses data from the last Dry Run.">4. Commands</button>
    <button class="btn btn-primary" onclick="triggerPhase('phase=transactions','txnBtn')" id="txnBtn" title="Post receive transactions to Intuiflow for completed operations. Uses data from the last Dry Run.">5. Transactions</button>
    <button class="btn btn-outline" onclick="triggerPhase('phase=sync','syncBtn')" id="syncBtn" title="Update the internal tracker with the results of this run. Future runs use this to detect what changed. Run after steps 2–5.">6. Sync State</button>
  </div>
  ${lastRun ? `
  <p style="font-size:13px;color:#64748b">
    Last run: ${statusBadge(lastRun.status)}
    <span class="mono">${lastRun.started_at?.substring(0,19) || ''}</span>
    ${lastRun.error_text ? `<br><span style="color:#dc2626;font-size:12px">${escapeHtml(lastRun.error_text.substring(0, 200))}</span>` : ''}
  </p>` : '<p class="empty">No runs yet. Click "Run Now" to start.</p>'}
</div>

<div class="card">
  <h2>Recent Runs</h2>
  <table>
    <thead><tr><th>ID</th><th>Trigger</th><th>Started</th><th>Duration</th><th>Status</th><th>Stats</th><th></th></tr></thead>
    <tbody>
    ${(recentRuns.results as any[]).map(r => {
      let s: any = {};
      try { s = JSON.parse(r.stats_json || '{}'); } catch {}
      const dur = r.finished_at && r.started_at
        ? ((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000).toFixed(1) + 's'
        : '-';
      return `<tr>
        <td class="mono">${r.id}</td>
        <td>${r.trigger_type}</td>
        <td class="mono">${r.started_at?.substring(0,19) || ''}</td>
        <td>${dur}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="mono" style="font-size:11px">${s.workOrders ?? '-'} WO, ${s.commands ?? '-'} cmd, ${s.transactions ?? '-'} txn</td>
        <td><a href="/runs?id=${r.id}" class="btn btn-outline btn-sm">Details</a></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
</div>

<script>
async function triggerPhase(qs,btnId){
  const btn=document.getElementById(btnId);
  const origText=btn.textContent;
  btn.disabled=true;btn.textContent='Running...';
  try{
    const res=await fetch('/api/runs/trigger?'+qs,{method:'POST',headers:{'Content-Type':'application/json'}});
    const r=await res.json();
    if(!r.ok)throw new Error(r.error);
    const s=r.stats;
    showToast('Run #'+r.runId+': '+s.workOrders+' WO, '+s.commands+' cmd, '+s.transactions+' txn');
    setTimeout(()=>location.reload(),1500);
  }catch(e){
    showToast(e.message,'error');
  }finally{btn.disabled=false;btn.textContent=origText}
}
</script>`;

  return layout('Dashboard', '/', body);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
