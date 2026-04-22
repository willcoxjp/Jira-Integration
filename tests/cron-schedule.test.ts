import { describe, it, expect } from 'vitest';
import {
  matchesSchedule,
  formatScheduleSummary,
  getNextPhase,
  toLocalParts,
  type CronScheduleConfig,
} from '../src/utils/cron-schedule';

const BASE_CONFIG: CronScheduleConfig = {
  enabled: true,
  timezone: 'America/New_York',
  days: [1, 2, 3, 4, 5], // Mon–Fri
  hour: 6,
  minute: 0,
};

// April 22 2026, 10:00 UTC = 6:00 AM EDT (UTC-4, summer)
const WED_6AM_ET = new Date('2026-04-22T10:00:00Z');
// January 15 2026, 11:00 UTC = 6:00 AM EST (UTC-5, winter)
const THU_6AM_ET_WINTER = new Date('2026-01-15T11:00:00Z');
// Saturday at 10:00 UTC
const SAT_6AM_ET = new Date('2026-04-25T10:00:00Z');

// ─── toLocalParts ────────────────────────────────────────────────────────────

describe('toLocalParts', () => {
  it('converts UTC to Eastern summer time (UTC-4)', () => {
    const parts = toLocalParts(WED_6AM_ET, 'America/New_York');
    expect(parts.hour).toBe(6);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBe(3); // Wednesday
  });

  it('converts UTC to Eastern winter time (UTC-5)', () => {
    const parts = toLocalParts(THU_6AM_ET_WINTER, 'America/New_York');
    expect(parts.hour).toBe(6);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBe(4); // Thursday
  });

  it('handles UTC timezone (no conversion)', () => {
    const now = new Date('2026-04-22T06:00:00Z');
    const parts = toLocalParts(now, 'UTC');
    expect(parts.hour).toBe(6);
    expect(parts.minute).toBe(0);
  });

  it('handles Pacific time (UTC-7 in summer)', () => {
    // 10:00 UTC = 3:00 AM PDT
    const parts = toLocalParts(WED_6AM_ET, 'America/Los_Angeles');
    expect(parts.hour).toBe(3);
  });
});

// ─── matchesSchedule ──────────────────────────────────────────────────────────

describe('matchesSchedule', () => {
  it('returns true for an exact match', () => {
    expect(matchesSchedule(WED_6AM_ET, BASE_CONFIG)).toBe(true);
  });

  it('returns true within +2 minutes (CF timing tolerance)', () => {
    const plusTwo = new Date(WED_6AM_ET.getTime() + 2 * 60 * 1000);
    expect(matchesSchedule(plusTwo, BASE_CONFIG)).toBe(true);
  });

  it('returns true within -2 minutes (CF timing tolerance)', () => {
    const minusTwo = new Date(WED_6AM_ET.getTime() - 2 * 60 * 1000);
    expect(matchesSchedule(minusTwo, BASE_CONFIG)).toBe(true);
  });

  it('returns false at +3 minutes (outside tolerance)', () => {
    const plusThree = new Date(WED_6AM_ET.getTime() + 3 * 60 * 1000);
    expect(matchesSchedule(plusThree, BASE_CONFIG)).toBe(false);
  });

  it('returns false when disabled', () => {
    expect(matchesSchedule(WED_6AM_ET, { ...BASE_CONFIG, enabled: false })).toBe(false);
  });

  it('returns false when no days are configured', () => {
    expect(matchesSchedule(WED_6AM_ET, { ...BASE_CONFIG, days: [] })).toBe(false);
  });

  it('returns false on a Saturday (not in Mon–Fri days)', () => {
    expect(matchesSchedule(SAT_6AM_ET, BASE_CONFIG)).toBe(false);
  });

  it('returns false when hour does not match', () => {
    const wrong = new Date('2026-04-22T11:00:00Z'); // 7 AM ET
    expect(matchesSchedule(wrong, BASE_CONFIG)).toBe(false);
  });

  it('returns true in winter (EST UTC-5) for same local hour', () => {
    expect(matchesSchedule(THU_6AM_ET_WINTER, BASE_CONFIG)).toBe(true);
  });

  it('handles :30 minute configuration', () => {
    const config: CronScheduleConfig = { ...BASE_CONFIG, minute: 30 };
    const at630 = new Date('2026-04-22T10:30:00Z'); // 6:30 AM ET
    expect(matchesSchedule(at630, config)).toBe(true);
  });

  it('does not fire at :15 when configured for :00', () => {
    const at615 = new Date('2026-04-22T10:15:00Z'); // 6:15 AM ET
    expect(matchesSchedule(at615, BASE_CONFIG)).toBe(false);
  });
});

// ─── formatScheduleSummary ────────────────────────────────────────────────────

describe('formatScheduleSummary', () => {
  it('formats Mon–Fri shorthand', () => {
    expect(formatScheduleSummary(BASE_CONFIG)).toBe('Mon–Fri at 6:00 AM Eastern');
  });

  it('returns "Disabled" when enabled is false', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, enabled: false })).toBe('Disabled');
  });

  it('returns "No days selected" when days is empty', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, days: [] })).toBe('No days selected');
  });

  it('formats a PM time correctly', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, hour: 14, minute: 30 }))
      .toBe('Mon–Fri at 2:30 PM Eastern');
  });

  it('formats noon correctly', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, hour: 12, minute: 0 }))
      .toBe('Mon–Fri at 12:00 PM Eastern');
  });

  it('formats midnight correctly', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, hour: 0, minute: 0 }))
      .toBe('Mon–Fri at 12:00 AM Eastern');
  });

  it('uses timezone label from TIMEZONES list', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, timezone: 'America/Chicago' }))
      .toContain('Central');
  });

  it('uses IANA name as fallback for unknown timezone', () => {
    expect(formatScheduleSummary({ ...BASE_CONFIG, timezone: 'Europe/London' }))
      .toContain('Europe/London');
  });

  it('formats individual days when not a named pattern', () => {
    const summary = formatScheduleSummary({ ...BASE_CONFIG, days: [1, 3, 5] }); // Mon, Wed, Fri
    expect(summary).toContain('Mon');
    expect(summary).toContain('Wed');
    expect(summary).toContain('Fri');
  });
});

// ─── getNextPhase ─────────────────────────────────────────────────────────────

describe('getNextPhase', () => {
  it('wo → reschedule', () => expect(getNextPhase('wo')).toBe('reschedule'));
  it('reschedule → commands', () => expect(getNextPhase('reschedule')).toBe('commands'));
  it('commands → transactions', () => expect(getNextPhase('commands')).toBe('transactions'));
  it('transactions → sync', () => expect(getNextPhase('transactions')).toBe('sync'));
  it('sync → null (last phase)', () => expect(getNextPhase('sync')).toBeNull());
  it('unknown phase → null', () => expect(getNextPhase('unknown')).toBeNull());
});
