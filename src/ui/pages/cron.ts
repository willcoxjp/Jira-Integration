import type { Env } from '../../types';
import { layout } from '../layout';
import { TIMEZONES, formatScheduleSummary, type CronScheduleConfig } from '../../utils/cron-schedule';

const DAY_LABELS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function hourLabel(h: number): string {
  if (h === 0) return '12:00 AM (Midnight)';
  if (h === 12) return '12:00 PM (Noon)';
  const ampm = h < 12 ? 'AM' : 'PM';
  const disp = h > 12 ? h - 12 : h;
  return `${disp}:00 ${ampm}`;
}

export async function cronPage(env: Env): Promise<string> {
  const rows = await env.DB
    .prepare("SELECT key, value FROM settings WHERE key IN ('cron_enabled','cron_timezone','cron_days','cron_hour','cron_minute')")
    .all<{ key: string; value: string }>();

  const s: Record<string, string> = {};
  for (const row of rows.results) s[row.key] = row.value;

  const config: CronScheduleConfig = {
    enabled:  s.cron_enabled !== 'false',
    timezone: s.cron_timezone ?? 'America/New_York',
    days:     (s.cron_days ?? '1,2,3,4,5').split(',').map(Number),
    hour:     parseInt(s.cron_hour  ?? '6',  10),
    minute:   parseInt(s.cron_minute ?? '0', 10),
  };

  const summary = formatScheduleSummary(config);

  const tzOptions = TIMEZONES.map(tz =>
    `<option value="${tz.value}"${tz.value === config.timezone ? ' selected' : ''}>${tz.label}</option>`
  ).join('\n');

  const hourOptions = Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}"${h === config.hour ? ' selected' : ''}>${hourLabel(h)}</option>`
  ).join('\n');

  const minuteOptions = [
    { value: 0,  label: ':00' },
    { value: 15, label: ':15' },
    { value: 30, label: ':30' },
    { value: 45, label: ':45' },
  ].map(m =>
    `<option value="${m.value}"${m.value === config.minute ? ' selected' : ''}>${m.label}</option>`
  ).join('\n');

  const dayCheckboxes = DAY_LABELS.map(d => `
    <label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:13px;cursor:pointer">
      <input type="checkbox" name="cronDay" value="${d.value}"${config.days.includes(d.value) ? ' checked' : ''}>
      ${d.label}
    </label>`
  ).join('');

  const body = `
<h1>Cron Schedule</h1>

<div class="card">
  <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
    <div>
      <div style="font-size:13px;color:#64748b;margin-bottom:2px">Current schedule</div>
      <div style="font-size:16px;font-weight:600;color:#0f172a">${summary}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:4px">
        Worker polls every 15 min. Pipeline fires when time matches your settings (±2 min).
      </div>
    </div>
    <span style="margin-left:auto" class="badge ${config.enabled ? 'badge-ok' : 'badge-error'}" id="statusBadge">
      ${config.enabled ? 'Enabled' : 'Disabled'}
    </span>
  </div>
</div>

<div class="card">
  <h2 style="margin-bottom:1.25rem">Edit Schedule</h2>

  <div class="form-row">
    <label>Enabled</label>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
      <input type="checkbox" id="cronEnabled" ${config.enabled ? 'checked' : ''}
        style="width:16px;height:16px;cursor:pointer">
      Run the pipeline on the configured schedule
    </label>
  </div>

  <div class="form-row">
    <label>Timezone</label>
    <select id="cronTimezone" style="max-width:340px">
      ${tzOptions}
    </select>
  </div>

  <div class="form-row" style="align-items:flex-start">
    <label style="padding-top:4px">Days</label>
    <div style="display:flex;flex-wrap:wrap;gap:2px 0">
      ${dayCheckboxes}
    </div>
  </div>

  <div class="form-row">
    <label>Hour</label>
    <select id="cronHour" style="max-width:220px">
      ${hourOptions}
    </select>
    <span style="font-size:12px;color:#94a3b8">(in selected timezone)</span>
  </div>

  <div class="form-row">
    <label>Minute</label>
    <select id="cronMinute" style="max-width:100px">
      ${minuteOptions}
    </select>
  </div>

  <div style="margin-top:1rem;display:flex;align-items:center;gap:1rem">
    <button class="btn btn-primary" id="saveBtn" onclick="saveSchedule()">Save Schedule</button>
    <span id="previewText" style="font-size:13px;color:#64748b"></span>
  </div>
</div>

<script>
const TIMEZONES = ${JSON.stringify(TIMEZONES)};

function getSelectedDays() {
  return Array.from(document.querySelectorAll('input[name="cronDay"]:checked'))
    .map(el => parseInt(el.value));
}

function tzLabel(tzValue) {
  const tz = TIMEZONES.find(t => t.value === tzValue);
  return tz ? tz.label.split(' ')[0] : tzValue;
}

function formatPreview() {
  const enabled = document.getElementById('cronEnabled').checked;
  if (!enabled) return 'Schedule disabled';

  const days = getSelectedDays().sort();
  if (days.length === 0) return 'No days selected';

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayStr = days.join(',') === '1,2,3,4,5' ? 'Mon–Fri'
    : days.join(',') === '0,1,2,3,4,5,6' ? 'Every day'
    : days.map(d => dayNames[d]).join(', ');

  const h = parseInt(document.getElementById('cronHour').value);
  const m = parseInt(document.getElementById('cronMinute').value);
  const ampm = h < 12 ? 'AM' : 'PM';
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minStr = String(m).padStart(2, '0');
  const tz = tzLabel(document.getElementById('cronTimezone').value);

  return \`Preview: \${dayStr} at \${disp}:\${minStr} \${ampm} \${tz}\`;
}

function updatePreview() {
  document.getElementById('previewText').textContent = formatPreview();
}

// Wire up all controls to update preview
document.getElementById('cronEnabled').addEventListener('change', updatePreview);
document.getElementById('cronTimezone').addEventListener('change', updatePreview);
document.getElementById('cronHour').addEventListener('change', updatePreview);
document.getElementById('cronMinute').addEventListener('change', updatePreview);
document.querySelectorAll('input[name="cronDay"]').forEach(el =>
  el.addEventListener('change', updatePreview)
);

async function saveSchedule() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const days = getSelectedDays();
    if (days.length === 0) {
      showToast('Select at least one day', 'error');
      return;
    }
    await apiPut('settings', {
      cron_enabled:  document.getElementById('cronEnabled').checked ? 'true' : 'false',
      cron_timezone: document.getElementById('cronTimezone').value,
      cron_days:     days.join(','),
      cron_hour:     document.getElementById('cronHour').value,
      cron_minute:   document.getElementById('cronMinute').value,
    });
    showToast('Schedule saved');
    setTimeout(() => location.reload(), 800);
  } catch(e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save Schedule';
  }
}

updatePreview();
</script>`;

  return layout('Cron Schedule', '/cron', body);
}
