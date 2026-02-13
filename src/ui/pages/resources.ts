import type { Env } from '../../types';
import { layout } from '../layout';

export async function resourcesPage(env: Env): Promise<string> {
  const result = await env.DB.prepare('SELECT * FROM resources ORDER BY resource_name').all();
  const rows = result.results as any[];

  const body = `
<h1>Resources</h1>
<p style="font-size:13px;color:#64748b;margin-bottom:1rem">Finite capacity resources in Intuiflow. These define the constraints for scheduling.</p>

<div class="card">
  <table>
    <thead><tr><th>Name</th><th>Location</th><th>Type</th><th>Count</th><th>Crew</th><th>Efficiency %</th><th>Calendar</th><th>Active</th><th></th></tr></thead>
    <tbody>
    ${rows.map(r => `
      <tr data-id="${r.id}">
        <td><input value="${esc(r.resource_name)}" data-f="resource_name"></td>
        <td><input value="${esc(r.location)}" data-f="location" style="width:80px"></td>
        <td><input value="${esc(r.resource_type)}" data-f="resource_type" style="width:80px"></td>
        <td><input type="number" value="${r.capacity_count}" data-f="capacity_count" style="width:50px"></td>
        <td><input type="number" value="${r.crew_size}" data-f="crew_size" style="width:50px"></td>
        <td><input type="number" value="${r.efficiency}" data-f="efficiency" style="width:60px"></td>
        <td><input value="${esc(r.resource_calendar)}" data-f="resource_calendar" style="width:160px"></td>
        <td><select data-f="is_active"><option value="1" ${r.is_active?'selected':''}>Yes</option><option value="0" ${!r.is_active?'selected':''}>No</option></select></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="saveRes(${r.id},this)">Save</button>
          <button class="btn btn-danger btn-sm" onclick="delRes(${r.id})">Del</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:0.75rem">
    <button class="btn btn-success" onclick="addRes()">+ Add Resource</button>
  </div>
</div>

<script>
async function saveRes(id,btn){
  const row=btn.closest('tr');const d={};
  row.querySelectorAll('[data-f]').forEach(el=>{d[el.dataset.f]=el.type==='number'?+el.value:el.value});
  d.is_active=+d.is_active;
  try{await apiPut('resources/'+id,d);showToast('Saved')}catch(e){showToast(e.message,'error')}
}
async function delRes(id){if(!confirm('Delete?'))return;try{await apiDelete('resources/'+id);location.reload()}catch(e){showToast(e.message,'error')}}
async function addRes(){try{await apiPost('resources',{resource_name:'New Resource',location:'DD Tech',resource_type:'Resource',capacity_count:1,crew_size:1,efficiency:100,resource_calendar:'Standard Calendar (M-F)',is_active:1});location.reload()}catch(e){showToast(e.message,'error')}}
</script>`;

  return layout('Resources', '/resources', body);
}

function esc(s: string): string {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
