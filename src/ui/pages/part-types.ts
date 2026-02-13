import type { Env } from '../../types';
import { layout } from '../layout';

export async function partTypesPage(env: Env): Promise<string> {
  const result = await env.DB.prepare('SELECT * FROM part_types ORDER BY jira_issue_type').all();
  const rows = result.results as any[];

  const body = `
<h1>Part Type Mappings</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Maps Jira Issue Type to Intuiflow Part Number. Excluded types are skipped during sync.</p>

<div class="card">
  <table>
    <thead><tr><th>Jira Issue Type</th><th>IF Part Number</th><th>Included</th><th>First Op Seq</th><th></th></tr></thead>
    <tbody id="ptBody">
    ${rows.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.jira_issue_type)}" data-f="jira_issue_type"></td>
        <td><input value="${esc(r.intuiflow_part_number)}" data-f="intuiflow_part_number"></td>
        <td><select data-f="is_included"><option value="1" ${r.is_included?'selected':''}>Yes</option><option value="0" ${!r.is_included?'selected':''}>No</option></select></td>
        <td><input type="number" value="${r.first_operation_seq}" data-f="first_operation_seq" style="width:80px"></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="savePT(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delPT(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addPT()">+ Add Part Type</button>
  </div>
</div>

<script>
async function savePT(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  d.is_included=+d.is_included;
  try{await apiPut('part-types/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delPT(id){
  if(!confirm('Delete this part type?'))return;
  try{await apiDelete('part-types/'+id);location.reload()}catch(e){showToast(e.message,'error')}
}
async function addPT(){
  try{await apiPost('part-types',{jira_issue_type:'New Type',intuiflow_part_number:'New Type',is_included:1,first_operation_seq:100});location.reload()}catch(e){showToast(e.message,'error')}
}
</script>`;

  return layout('Part Types', '/part-types', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
