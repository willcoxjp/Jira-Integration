export interface CronScheduleConfig {
  enabled: boolean;
  timezone: string;
  days: number[];  // 0=Sun, 1=Mon, ..., 6=Sat
  hour: number;    // 0–23 in the configured timezone
  minute: number;  // 0, 15, 30, or 45
}

export const TIMEZONES = [
  { value: 'America/New_York',   label: 'Eastern (ET) — America/New_York' },
  { value: 'America/Chicago',    label: 'Central (CT) — America/Chicago' },
  { value: 'America/Denver',     label: 'Mountain (MT) — America/Denver' },
  { value: 'America/Phoenix',    label: 'Mountain no DST — America/Phoenix' },
  { value: 'America/Los_Angeles',label: 'Pacific (PT) — America/Los_Angeles' },
  { value: 'America/Anchorage',  label: 'Alaska (AKT) — America/Anchorage' },
  { value: 'America/Honolulu',   label: 'Hawaii (HST) — America/Honolulu' },
  { value: 'UTC',                label: 'UTC' },
];

export const PHASE_SEQUENCE = ['wo', 'reschedule', 'commands', 'transactions', 'sync'];

export function getNextPhase(phase: string): string | null {
  const idx = PHASE_SEQUENCE.indexOf(phase);
  return idx >= 0 && idx < PHASE_SEQUENCE.length - 1 ? PHASE_SEQUENCE[idx + 1] : null;
}

/** Convert a UTC Date to local {day, hour, minute} in the given IANA timezone. */
export function toLocalParts(now: Date, timezone: string): { day: number; hour: number; minute: number } {
  // toLocaleString converts to local wall-clock time; parsing it back gives
  // a Date whose getDay/getHours/getMinutes reflect the target timezone.
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return { day: local.getDay(), hour: local.getHours(), minute: local.getMinutes() };
}

/**
 * Returns true when `now` (UTC) falls within the configured schedule window.
 * Allows ±2 minutes to absorb Cloudflare's cron firing imprecision.
 * The caller fires every 15 minutes; minute options are :00/:15/:30/:45,
 * so the ±2 window never overlaps the adjacent slot.
 */
export function matchesSchedule(now: Date, config: CronScheduleConfig): boolean {
  if (!config.enabled) return false;
  if (config.days.length === 0) return false;

  const { day, hour, minute } = toLocalParts(now, config.timezone);

  if (!config.days.includes(day)) return false;

  // Compare as total minutes from midnight to handle cross-hour boundaries (e.g. 5:58 vs 6:00).
  // Also wrap around midnight (1440 min/day) so 23:59 vs 00:01 works.
  const configTotal = config.hour * 60 + config.minute;
  const actualTotal = hour * 60 + minute;
  const diff = Math.abs(actualTotal - configTotal);
  return Math.min(diff, 1440 - diff) <= 2;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatScheduleSummary(config: CronScheduleConfig): string {
  if (!config.enabled) return 'Disabled';
  if (config.days.length === 0) return 'No days selected';

  const dayStr = formatDays(config.days);
  const timeStr = formatTime(config.hour, config.minute);
  const tz = TIMEZONES.find(t => t.value === config.timezone);
  const tzLabel = tz ? tz.label.split(' ')[0] : config.timezone;

  return `${dayStr} at ${timeStr} ${tzLabel}`;
}

function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '1,2,3,4,5') return 'Mon–Fri';
  if (key === '0,1,2,3,4,5,6') return 'Every day';
  if (key === '0,6') return 'Weekends';
  return sorted.map(d => DAY_NAMES[d]).join(', ');
}

function formatTime(hour: number, minute: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = String(minute).padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}
