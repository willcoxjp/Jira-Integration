import { describe, it, expect } from 'vitest';
import { addDays, nextDecember25, formatDate, calculateDueDate } from '../src/utils/dates';
import type { PriorityRule } from '../src/types';

describe('addDays', () => {
  it('adds positive days', () => {
    const base = new Date('2025-01-01');
    const result = addDays(base, 45);
    expect(result.toISOString().split('T')[0]).toBe('2025-02-15');
  });

  it('adds zero days returns same date', () => {
    const base = new Date('2025-06-15');
    const result = addDays(base, 0);
    expect(result.toISOString().split('T')[0]).toBe('2025-06-15');
  });

  it('handles month/year rollover', () => {
    const base = new Date('2025-12-01');
    const result = addDays(base, 45);
    expect(result.toISOString().split('T')[0]).toBe('2026-01-15');
  });
});

describe('nextDecember25', () => {
  it('returns Dec 25 of next year when called before Dec 25', () => {
    const result = nextDecember25(new Date('2025-03-15'));
    expect(result).toBe('2026-12-25');
  });

  it('returns Dec 25 of next year when called on Dec 25', () => {
    const result = nextDecember25(new Date('2025-12-25'));
    expect(result).toBe('2026-12-25');
  });

  it('returns Dec 25 of next year when called after Dec 25', () => {
    const result = nextDecember25(new Date('2025-12-30'));
    expect(result).toBe('2026-12-25');
  });
});

describe('formatDate', () => {
  it('formats Date object as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2025-03-05T12:00:00Z'))).toBe('2025-03-05');
  });

  it('formats ISO string as YYYY-MM-DD', () => {
    expect(formatDate('2025-03-05T12:00:00.000Z')).toBe('2025-03-05');
  });
});

describe('calculateDueDate', () => {
  const rules = new Map<number, PriorityRule>([
    [1, { priorityPrefix: 1, daysOffset: 45, fixedDate: null, description: '' }],
    [2, { priorityPrefix: 2, daysOffset: 90, fixedDate: null, description: '' }],
    [3, { priorityPrefix: 3, daysOffset: 180, fixedDate: null, description: '' }],
    [9, { priorityPrefix: 9, daysOffset: null, fixedDate: '12-25', description: '' }],
  ]);

  it('returns today + 45 for priority 1x', () => {
    const today = new Date('2025-01-01');
    expect(calculateDueDate(12, rules, today)).toBe('2025-02-15');
  });

  it('returns today + 90 for priority 2x', () => {
    const today = new Date('2025-01-01');
    expect(calculateDueDate(23, rules, today)).toBe('2025-04-01');
  });

  it('returns today + 180 for priority 3x', () => {
    const today = new Date('2025-01-01');
    expect(calculateDueDate(34, rules, today)).toBe('2025-06-30');
  });

  it('returns Dec 25 next year for priority 9x', () => {
    const today = new Date('2025-06-15');
    expect(calculateDueDate(92, rules, today)).toBe('2026-12-25');
  });

  it('returns Dec 25 next year for unknown priority prefix', () => {
    const today = new Date('2025-06-15');
    expect(calculateDueDate(55, rules, today)).toBe('2026-12-25');
  });
});
