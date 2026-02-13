import type { Env } from '../../types';
import { layout } from '../layout';

export async function effortPage(env: Env): Promise<string> {
  const result = await env.DB.prepare('SELECT * FROM effort_mappings ORDER BY hours').all();
  const rows = result.results as any[];

  const body = `
<h1>Effort Mappings</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Maps Jira "Effort" custom field labels to work order hours. When no original estimate exists, these values are used.</p>

<div class="card">
  <table>
    <thead><tr><th>Effort Label</th><th>Hours</th><th></th></tr></thead>
    <tbody>
    ${rows.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.effort_label)}" data-f="effort_label"></td>
        <td><input type="number" step="0.1" value="${r.hours}" data-f="hours" style="width:80px"></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="saveE(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delE(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addE()">+ Add Effort Mapping</button>
  </div>
</div>

<script>
async function saveE(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  try{await apiPut('effort-mappings/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delE(id){if(!confirm('Delete?'))return;try{await apiDelete('effort-mappings/'+id);location.reload()}catch(e){showToast(e.message,'error')}}
async function addE(){try{await apiPost('effort-mappings',{effort_label:'New Label',hours:8});location.reload()}catch(e){showToast(e.message,'error')}}
</script>`;

  return layout('Effort', '/effort', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
