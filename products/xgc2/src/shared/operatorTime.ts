export const TIMEZONE_PREFERENCE_SYSTEM = 'system';

export const operatorIanaTimeZones = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
] as const;

const RESOLVED_STORAGE_KEY = 'xgc.timezone.resolved';

let resolvedTimeZone = readCachedResolvedTimeZone();

function readCachedResolvedTimeZone() {
  try {
    const cached = window.localStorage.getItem(RESOLVED_STORAGE_KEY);
    if (cached && cached !== 'Local') return cached;
  } catch {
    /* ignore */
  }
  return 'UTC';
}

export function setResolvedOperatorTimeZone(timeZone: string) {
  const next = timeZone.trim();
  if (!next || next === 'Local') return;
  resolvedTimeZone = next;
  try {
    window.localStorage.setItem(RESOLVED_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function resolvedOperatorTimeZone() {
  return resolvedTimeZone;
}

export function formatOperatorDateTime(
  value: string | number | Date,
  locale?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : String(value);
  return date.toLocaleString(locale, { ...options, timeZone: resolvedTimeZone });
}

export function operatorCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: number('year'), month: number('month'), day: number('day') };
}

export function sameOperatorDay(left: Date, right: Date) {
  const a = operatorCalendarDate(left);
  const b = operatorCalendarDate(right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
