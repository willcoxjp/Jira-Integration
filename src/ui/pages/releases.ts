import type { Env } from '../../types';
import { layout } from '../layout';

export async function releasesPage(env: Env): Promise<string> {
  const result = await env.DB.prepare('SELECT * FROM release_dates ORDER BY release_date DESC').all();
  const rows = result.results as any[];

  const body = `
<h1>Release Dates</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Maps Jira "Fix versions" to release dates used for work order RequestDate and PromiseDate.</p>

<div class="card">
  <table>
    <thead><tr><th>Version Name</th><th>Status</th><th>Start Date</th><th>Release Date</th><th>Description</th><th></th></tr></thead>
    <tbody>
    ${rows.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.version_name)}" data-f="version_name" style="width:200px"></td>
        <td><input value="${esc(r.status || '')}" data-f="status" style="width:100px"></td>
        <td><input type="date" value="${r.start_date || ''}" data-f="start_date"></td>
        <td><input type="date" value="${r.release_date || ''}" data-f="release_date"></td>
        <td><input value="${esc(r.description || '')}" data-f="description" style="width:200px"></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="saveRD(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delRD(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addRD()">+ Add Release</button>
  </div>
</div>

<script>
async function saveRD(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.value||null});
  try{await apiPut('release-dates/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delRD(id){if(!confirm('Delete?'))return;try{await apiDelete('release-dates/'+id);location.reload()}catch(e){showToast(e.message,'error')}}
async function addRD(){try{await apiPost('release-dates',{version_name:'New Release',status:'UNRELEASED'});location.reload()}catch(e){showToast(e.message,'error')}}
</script>`;

  return layout('Releases', '/releases', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
