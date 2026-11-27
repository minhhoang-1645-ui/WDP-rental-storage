/** The facility's calendar day. Prisma @db.Date values remain UTC date-only values. */
export const businessDate = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export const businessToday = (now = new Date()) => new Date(businessDate(now) + 'T00:00:00.000Z');

export function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function rentalMonthEnd(start: string, months: number) {
  if (!isIsoCalendarDate(start) || !Number.isSafeInteger(months) || months < 1) return '';
  const [year, month, day] = start.split('-').map(Number);
  const target = new Date(start + 'T00:00:00Z');
  target.setUTCDate(1);
  target.setUTCFullYear(year, month - 1 + months, 1);
  if (!Number.isFinite(+target) || target.getUTCFullYear() > 9999) return '';
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day, last.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
