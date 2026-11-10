/** ISO calendar dates, without timezone-dependent parsing or day rollover. */
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function daysInMonth(year: string, month: string) {
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month), 0);
  return date.getUTCDate();
}

export const vietnamCalendarDate = (time = Date.now()) => new Date(time + 7 * 3600000).toISOString().slice(0, 10);

export function calendarChoice(year: string, month: string, day: string) {
  const safeDay = Math.max(1, Math.min(Number(day) || 1, daysInMonth(year, month)));
  return `${year}-${month.padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}
