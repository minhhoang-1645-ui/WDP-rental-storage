const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Calendar-month preview only; availability and prices are validated by the API. */
export function rentalEndDate(start: string, months: number): string {
  if (!validDate(start) || !Number.isSafeInteger(months) || months < 1) return '';
  const date = new Date(start + 'T00:00:00Z');
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  if (!Number.isFinite(+end) || end.getUTCFullYear() > 9999) return '';
  end.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
  return end.toISOString().slice(0, 10);
}
