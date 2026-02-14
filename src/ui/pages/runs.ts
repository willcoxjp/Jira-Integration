import type { Env } from '../../types';
import { layout } from '../layout';

export async function runsPage(env: Env, url: URL): Promise<string> {
  const detailId = url.searchParams.get('id');

  if (detailId) {
    return await runDetailPage(env, detailId);
  }

  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = 25;
  const offset = (page - 1) * limit;

  const result = await env.DB
    .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all();
  const runs = result.results as any[];

  const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM runs').first<{ total: number }>();
  const total = countRow?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const statusBadge = (s: string) => {
    if (s === 'ok') return '<span class="badge badge-ok">OK</span>';
    if (s === 'dry_run') return '<span class="badge badge-ok">Dry Run</span>';
    if (s === 'error') return '<span class="badge badge-error">Error</span>';
    if (s === 'running') return '<span class="badge badge-running">Running</span>';
    return `<span class="badge badge-ok">${escHtml(s)}</span>`;
  };

  const body = `
<h1>Run History</h1>

<div class="card">
  <table>
    <thead><tr><th>ID</th><th>Trigger</th><th>Started</th><th>Finished</th><th>Status</th><th>Stats</th><th>CSV</th><th></th></tr></thead>
    <tbody>
    ${runs.map(r => {
      let s: any = {};
      try { s = JSON.parse(r.stats_json || '{}'); } catch {}
      return `<tr>
        <td class="mono">${r.id}</td>
        <td>${r.trigger_type || 'manual'}</td>
        <td class="mono">${(r.started_at || '').substring(0, 19)}</td>
        <td class="mono">${(r.finished_at || '').substring(0, 19)}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="mono" style="font-size:11px">${s.workOrders ?? '-'} WO, ${s.commands ?? '-'} cmd, ${s.transactions ?? '-'} txn</td>
        <td>
          <a href="/api/runs/${r.id}/csv?type=work_orders" class="btn btn-outline btn-sm" style="font-size:11px">WO</a>
          <a href="/api/runs/${r.id}/csv?type=commands" class="btn btn-outline btn-sm" style="font-size:11px">Cmd</a>
          <a href="/api/runs/${r.id}/csv?type=transactions" class="btn btn-outline btn-sm" style="font-size:11px">Txn</a>
        </td>
        <td><a href="/runs?id=${r.id}" class="btn btn-outline btn-sm">Details</a></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  ${totalPages > 1 ? `
  <div style="margin-top:0.75rem;display:flex;gap:0.5rem;justify-content:center">
    ${page > 1 ? `<a href="/runs?page=${page-1}" class="btn btn-outline btn-sm">Prev</a>` : ''}
    <span style="font-size:13px;color:#64748b;padding:0.25rem 0.5rem">Page ${page} of ${totalPages}</span>
    ${page < totalPages ? `<a href="/runs?page=${page+1}" class="btn btn-outline btn-sm">Next</a>` : ''}
  </div>` : ''}
</div>`;

  return layout('Runs', '/runs', body);
}

async function runDetailPage(env: Env, runId: string): Promise<string> {
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first<any>();
  if (!run) return layout('Run Not Found', '/runs', '<p>Run not found.</p>');

  const errors = await env.DB
    .prepare('SELECT * FROM errors WHERE run_id = ? ORDER BY id')
    .bind(runId)
    .all();

  const csvs = await env.DB
    .prepare('SELECT csv_type, row_count, created_at FROM run_csvs WHERE run_id = ?')
    .bind(runId)
    .all();

  let stats: any = {};
  try { stats = JSON.parse(run.stats_json || '{}'); } catch {}

  const body = `
<h1><a href="/runs" style="color:#3b82f6;text-decoration:none">&larr; Runs</a> &nbsp; Run #${runId}</h1>

<div class="stats">
  <div class="stat-card"><div class="stat-value">${stats.fetched ?? '-'}</div><div class="stat-label">Fetched</div></div>
  <div class="stat-card"><div class="stat-value">${stats.workOrders ?? '-'}</div><div class="stat-label">Work Orders</div></div>
  <div class="stat-card"><div class="stat-value">${stats.commands ?? '-'}</div><div class="stat-label">Commands</div></div>
  <div class="stat-card"><div class="stat-value">${stats.transactions ?? '-'}</div><div class="stat-label">Transactions</div></div>
  <div class="stat-card"><div class="stat-value">${stats.excluded ?? '-'}</div><div class="stat-label">Excluded</div></div>
  <div class="stat-card"><div class="stat-value">${stats.closed ?? '-'}</div><div class="stat-label">Closed</div></div>
</div>

<div class="card">
  <h2>Run Info</h2>
  <div class="form-row"><label>Status</label><span class="badge badge-${run.status}">${run.status}</span></div>
  <div class="form-row"><label>Trigger</label><span>${run.trigger_type || 'manual'}</span></div>
  <div class="form-row"><label>Started</label><span class="mono">${run.started_at || ''}</span></div>
  <div class="form-row"><label>Finished</label><span class="mono">${run.finished_at || ''}</span></div>
  ${run.error_text ? `<div class="form-row"><label>Error</label><pre style="background:#fef2f2;padding:0.5rem;border-radius:4px;font-size:12px;overflow:auto;max-height:200px">${escHtml(run.error_text)}</pre></div>` : ''}
</div>

${(csvs.results as any[]).length > 0 ? `
<div class="card">
  <h2>Generated CSVs</h2>
  <table>
    <thead><tr><th>Type</th><th>Rows</th><th>Created</th><th></th></tr></thead>
    <tbody>
    ${(csvs.results as any[]).map(c => `
      <tr>
        <td>${c.csv_type}</td>
        <td>${c.row_count}</td>
        <td class="mono">${(c.created_at || '').substring(0, 19)}</td>
        <td><a href="/api/runs/${runId}/csv?type=${c.csv_type}" class="btn btn-outline btn-sm">Download</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${(errors.results as any[]).length > 0 ? `
<div class="card">
  <h2>Errors</h2>
  <table>
    <thead><tr><th>Stage</th><th>Error</th><th>Time</th></tr></thead>
    <tbody>
    ${(errors.results as any[]).map(e => `
      <tr>
        <td>${e.stage}</td>
        <td style="font-size:12px">${escHtml(e.error_text)}</td>
        <td class="mono">${(e.created_at || '').substring(0, 19)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}
`;

  return layout(`Run #${runId}`, '/runs', body);
}

function escHtml(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
