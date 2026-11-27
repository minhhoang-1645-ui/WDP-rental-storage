const meters = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, useGrouping: false });

export function metersFromCm(cm: unknown): string {
  return typeof cm === 'number' && Number.isSafeInteger(cm) && cm > 0 ? meters.format(cm / 100) : '';
}

export function centimetersFromMeters(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cm = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cm) && cm >= 1 && cm <= 100_000 ? cm : null;
}
