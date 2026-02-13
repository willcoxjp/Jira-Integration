import type { Env } from '../../types';
import { layout } from '../layout';

export async function prioritiesPage(env: Env): Promise<string> {
  const rulesResult = await env.DB.prepare('SELECT * FROM priority_rules ORDER BY priority_prefix').all();
  const rules = rulesResult.results as any[];

  const valsResult = await env.DB.prepare('SELECT * FROM priority_values ORDER BY numeric_value').all();
  const vals = valsResult.results as any[];

  const body = `
<h1>Priority Configuration</h1>

<div class="card">
  <h2>Priority Rules (Due Date Calculation)</h2>
  <p style="font-size:12px;color:#64748b;margin-bottom:0.75rem">First digit of scheduling priority → due date offset from today. Set days_offset for relative dates, or fixed_date (MM-DD) for absolute.</p>
  <table>
    <thead><tr><th>Prefix</th><th>Days Offset</th><th>Fixed Date (MM-DD)</th><th>Description</th><th></th></tr></thead>
    <tbody>
    ${rules.map(r => `
      <tr data-id="${r.id}">
        <td><input type="number" value="${r.priority_prefix}" data-f="priority_prefix" style="width:60px"></td>
        <td><input type="number" value="${r.days_offset ?? ''}" data-f="days_offset" style="width:80px" placeholder="null"></td>
        <td><input value="${esc(r.fixed_date || '')}" data-f="fixed_date" style="width:80px" placeholder="MM-DD"></td>
        <td><input value="${esc(r.description || '')}" data-f="description"></td>
        <td><button class="btn btn-primary btn-sm" onclick="saveRule(${r.id},this)">Save</button></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="card">
  <h2>Priority Values (Jira Priority → Second Digit)</h2>
  <p style="font-size:12px;color:#64748b;margin-bottom:0.75rem">Maps Jira priority name to the second digit of the 2-digit scheduling priority.</p>
  <table>
    <thead><tr><th>Jira Priority Name</th><th>Numeric Value</th><th></th></tr></thead>
    <tbody>
    ${vals.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.jira_priority_name)}" data-f="jira_priority_name"></td>
        <td><input type="number" value="${r.numeric_value}" data-f="numeric_value" style="width:60px"></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="saveVal(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delVal(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addVal()">+ Add Priority Value</button>
  </div>
</div>

<script>
async function saveRule(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{
    if(el.dataset.f==='days_offset'){d[el.dataset.f]=el.value===''?null:+el.value}
    else if(el.dataset.f==='fixed_date'){d[el.dataset.f]=el.value||null}
    else{d[el.dataset.f]=el.type==='number'?+el.value:el.value}
  });
  try{await apiPut('priority-rules/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function saveVal(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  try{await apiPut('priority-values/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delVal(id){if(!confirm('Delete?'))return;try{await apiDelete('priority-values/'+id);location.reload()}catch(e){showToast(e.message,'error')}}
async function addVal(){try{await apiPost('priority-values',{jira_priority_name:'New Priority',numeric_value:5});location.reload()}catch(e){showToast(e.message,'error')}}
</script>`;

  return layout('Priorities', '/priorities', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
