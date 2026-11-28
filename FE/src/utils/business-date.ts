/** Calendar day at the single Vietnamese facility; independent of the browser's timezone. */
export const vietnamCalendarDate = (time = Date.now()) => new Date(time + 7 * 3600000).toISOString().slice(0, 10);

export function rentalMonthEnd(start: string, months: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isSafeInteger(months) || months < 1) return '';
  const target = new Date(start + 'T00:00:00Z');
  if (!Number.isFinite(+target) || target.toISOString().slice(0, 10) !== start) return '';
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  if (!Number.isFinite(+target) || target.getUTCFullYear() > 9999) return '';
  const last = new Date(target);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day, last.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

export function wholeRentalMonths(start: string, end: string) {
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7));
  return end && rentalMonthEnd(start, months) === end ? months : null;
}
