import type { Env } from '../../types';
import { layout } from '../layout';

export async function operationsPage(env: Env): Promise<string> {
  const result = await env.DB.prepare('SELECT * FROM operations_lookup ORDER BY operation_seq').all();
  const rows = result.results as any[];

  const body = `
<h1>Operations Lookup</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Maps Jira status names to Intuiflow operation sequence numbers for transaction tracking.</p>

<div class="card">
  <table>
    <thead><tr><th>Jira Status</th><th>Op Seq #</th><th>Operation Name</th><th></th></tr></thead>
    <tbody>
    ${rows.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.jira_status)}" data-f="jira_status"></td>
        <td><input type="number" value="${r.operation_seq}" data-f="operation_seq" style="width:80px"></td>
        <td><input value="${esc(r.operation_name)}" data-f="operation_name"></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="saveOp(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delOp(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addOp()">+ Add Operation</button>
  </div>
</div>

<script>
async function saveOp(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  try{await apiPut('operations/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delOp(id){if(!confirm('Delete?'))return;try{await apiDelete('operations/'+id);location.reload()}catch(e){showToast(e.message,'error')}}
async function addOp(){try{await apiPost('operations',{jira_status:'New Status',operation_seq:100,operation_name:'New Operation'});location.reload()}catch(e){showToast(e.message,'error')}}
</script>`;

  return layout('Operations', '/operations', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
