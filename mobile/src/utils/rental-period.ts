import { validDate } from '@/operations/availability';

/** Calendar-month preview only; availability and prices are validated by the API. */
export function rentalEndDate(start: string, months: number): string {
  if (!validDate(start) || ![1, 3, 6, 12].includes(months)) return '';
  const date = new Date(start + 'T00:00:00Z');
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  end.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
  return end.toISOString().slice(0, 10);
}
