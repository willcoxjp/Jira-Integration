import type { Env } from '../../types';
import { layout } from '../layout';

export async function settingsPage(env: Env): Promise<string> {
  const settingsResult = await env.DB.prepare('SELECT key, value, description FROM settings ORDER BY key').all();
  const settings = settingsResult.results as Array<{ key: string; value: string; description: string | null }>;

  const connectorsResult = await env.DB.prepare('SELECT * FROM connectors ORDER BY id').all();
  const connectors = connectorsResult.results as any[];

  const body = `
<h1>Settings</h1>

<div class="card">
  <h2>Connectors</h2>
  <table>
    <thead><tr><th>Name</th><th>Kind</th><th>Base URL</th><th>Auth</th><th>Enabled</th><th></th></tr></thead>
    <tbody id="connList">
    ${connectors.map(c => `
      <tr data-id="${c.id}">
        <td><input value="${esc(c.name)}" data-field="name" style="width:120px"></td>
        <td>${c.kind}</td>
        <td><input value="${esc(c.base_url)}" data-field="base_url" style="width:280px"></td>
        <td>${c.auth_type}</td>
        <td><span class="badge ${c.is_enabled ? 'badge-yes' : 'badge-no'}">${c.is_enabled ? 'Yes' : 'No'}</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="saveConn(${c.id},this)">Save</button></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="card">
  <div class="card-header">
    <h2>General Settings</h2>
    <button class="btn btn-primary" onclick="saveAllSettings()">Save All</button>
  </div>
  <div id="settingsForm">
  ${settings.map(s => `
    <div class="form-row">
      <label title="${esc(s.description || '')}">${s.key}</label>
      ${s.value.length > 60
        ? `<textarea data-key="${s.key}" rows="2" style="flex:1;min-width:300px">${esc(s.value)}</textarea>`
        : `<input data-key="${s.key}" value="${esc(s.value)}" style="min-width:300px">`
      }
      <span style="font-size:11px;color:#94a3b8;max-width:200px">${esc(s.description || '')}</span>
    </div>`).join('')}
  </div>
</div>

<script>
async function saveConn(id,btn){
  const row=btn.closest('tr');
  const name=row.querySelector('[data-field=name]').value;
  const base_url=row.querySelector('[data-field=base_url]').value;
  try{
    await apiPut('connectors/'+id,{name,base_url,auth_type:'basic',is_enabled:1});
    showToast('Connector saved');
  }catch(e){showToast(e.message,'error')}
}
async function saveAllSettings(){
  const obj={};
  document.querySelectorAll('#settingsForm [data-key]').forEach(el=>{
    obj[el.dataset.key]=el.value||el.textContent;
  });
  try{
    await apiPut('settings',obj);
    showToast('Settings saved');
  }catch(e){showToast(e.message,'error')}
}
</script>`;

  return layout('Settings', '/settings', body);
}

function esc(s: string): string {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
