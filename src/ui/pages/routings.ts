import type { Env } from '../../types';
import { layout } from '../layout';

export async function routingsPage(env: Env): Promise<string> {
  const result = await env.DB
    .prepare(
      `SELECT rd.*, pt.jira_issue_type
       FROM routing_definitions rd
       JOIN part_types pt ON rd.part_type_id = pt.id
       ORDER BY pt.jira_issue_type, rd.sort_order`
    )
    .all();
  const rows = result.results as any[];

  const ptResult = await env.DB.prepare('SELECT id, jira_issue_type FROM part_types WHERE is_included=1 ORDER BY jira_issue_type').all();
  const partTypes = ptResult.results as any[];

  // Group by part type
  const grouped = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.jira_issue_type;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const ptOptions = partTypes.map(p => `<option value="${p.id}">${esc(p.jira_issue_type)}</option>`).join('');

  let tables = '';
  for (const [typeName, ops] of grouped) {
    tables += `
    <div class="card">
      <h2>${esc(typeName)}</h2>
      <table>
        <thead><tr><th>Op Seq</th><th>Operation</th><th>Resource</th><th>Run Rate</th><th>Setup</th><th>Family</th><th>Order</th><th></th></tr></thead>
        <tbody>
        ${ops.map((r: any) => `
          <tr data-id="${r.id}">
            <td><input type="number" value="${r.operation_seq}" data-f="operation_seq" style="width:70px"></td>
            <td><input value="${esc(r.operation_name)}" data-f="operation_name"></td>
            <td><input value="${esc(r.resource_name)}" data-f="resource_name" style="width:100px"></td>
            <td><input type="number" step="0.1" value="${r.run_rate}" data-f="run_rate" style="width:70px"></td>
            <td><input type="number" step="0.1" value="${r.setup_time}" data-f="setup_time" style="width:70px"></td>
            <td><input value="${esc(r.family)}" data-f="family" style="width:130px"></td>
            <td><input type="number" value="${r.sort_order}" data-f="sort_order" style="width:50px"></td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="saveR(${r.id},${r.part_type_id},this)">Save</button>
              <button class="btn btn-danger btn-sm" onclick="delR(${r.id})">Del</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  const body = `
<h1>Routing Definitions</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Define the operations each part type goes through. Operations are ordered by sort_order.</p>

${tables}

<div class="card">
  <h2>Add New Routing Entry</h2>
  <div class="form-row">
    <label>Part Type</label><select id="newPT">${ptOptions}</select>
    <label>Op Seq</label><input type="number" id="newSeq" value="100" style="width:80px">
    <label>Name</label><input id="newName" value="">
    <label>Resource</label><input id="newRes" value="">
    <label>Rate</label><input type="number" id="newRate" value="1" step="0.1" style="width:70px">
    <button class="btn btn-success" onclick="addR()">Add</button>
  </div>
</div>

<script>
async function saveR(id,ptId,btn){
  const row=btn.closest('tr');const d={part_type_id:ptId};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  try{await apiPut('routings/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delR(id){
  if(!confirm('Delete?'))return;
  try{await apiDelete('routings/'+id);location.reload()}catch(e){showToast(e.message,'error')}
}
async function addR(){
  try{await apiPost('routings',{
    part_type_id:+document.getElementById('newPT').value,
    operation_seq:+document.getElementById('newSeq').value,
    operation_name:document.getElementById('newName').value,
    resource_name:document.getElementById('newRes').value,
    run_rate:+document.getElementById('newRate').value,
    family:'Single Constraint',sort_order:99
  });location.reload()}catch(e){showToast(e.message,'error')}
}
</script>`;

  return layout('Routings', '/routings', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
