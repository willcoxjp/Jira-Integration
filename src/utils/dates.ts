import type { PriorityRule } from '../types';

/** Add a number of days to a date, returning a new Date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Return "YYYY-12-25" for the year after the given date's year. */
export function nextDecember25(today: Date): string {
  const nextYear = today.getUTCFullYear() + 1;
  return `${nextYear}-12-25`;
}

/** Format a Date or ISO string as YYYY-MM-DD. */
export function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().split('T')[0];
}

/** Format a Date or ISO string as M/d/yyyy (US format for Intuiflow). */
export function formatDateUS(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Calculate due date based on 2-digit scheduling priority and priority rules.
 * First digit of priority is used to look up the rule.
 * Falls back to Dec 25 next year if no rule matches.
 */
export function calculateDueDate(
  priority: number,
  rules: Map<number, PriorityRule>,
  today: Date = new Date()
): string {
  const prefix = Math.floor(priority / 10);
  const rule = rules.get(prefix);

  if (rule) {
    if (rule.daysOffset !== null) {
      return formatDate(addDays(today, rule.daysOffset));
    }
    if (rule.fixedDate) {
      // fixedDate is "MM-DD" format, resolve to next occurrence
      return resolveFixedDate(rule.fixedDate, today);
    }
  }

  // Default fallback
  return nextDecember25(today);
}

/** Resolve a "MM-DD" fixed date to the next year. */
function resolveFixedDate(mmdd: string, today: Date): string {
  const nextYear = today.getUTCFullYear() + 1;
  const [month, day] = mmdd.split('-');
  return `${nextYear}-${month}-${day}`;
}
