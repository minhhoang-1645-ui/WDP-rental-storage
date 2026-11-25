import { reportRange } from '../../utils/reporting';

export const periods = {
  today: 'Hôm nay',
  month: 'Tháng này',
  previous: 'Tháng trước',
  quarter: 'Quý này',
  year: 'Năm nay',
  all: 'Tất cả thời gian',
  custom: 'Tùy chỉnh',
} as const;
export type Period = keyof typeof periods;
export type TrendGroup = 'day' | 'month';

export function reportTrendGroup(period: Period, from: string, to: string): TrendGroup {
  if (period === 'quarter' || period === 'year') return 'month';
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return days >= 0 && days < 31 ? 'day' : 'month';
}

export function reportPreset(period: Period, today: string) {
  if (period === 'all' || period === 'custom') return { from: '', to: '' };
  if (period === 'today') return { from: today, to: today };
  const [year, month] = today.split('-').map(Number);
  const date = (offset: number, day: number) => new Date(Date.UTC(year, month - 1 + offset, day)).toISOString().slice(0, 10);
  if (period === 'previous') return { from: date(-1, 1), to: date(0, 0) };
  if (period === 'quarter') return { from: date(-((month - 1) % 3), 1), to: today };
  return { from: reportRange(period, today).from, to: today };
}

export type Facility = { id: string; name: string; code: string };
export type Performance = Facility & {
  bookingEnabled: boolean;
  operationalStatus: string;
  units: { total: number; occupied: number; available: number; reserved: number; maintenance: number };
  activeContracts: number;
  newReservations: number;
  handovers: number;
  returns: number;
} & Partial<Record<MoneyKey, string | null>>;
type MoneyKey = 'rent' | 'services' | 'fees' | 'deposit' | 'billed' | 'debt' | 'received'
  | 'depositRefunded' | 'rentRefunded' | 'bookingRefunded' | 'transferRefunded';
export type PerformanceReport = { asOf: string; period: { from: string | null; to: string | null }; items: Performance[] };
export type Trend = { invoiceCount?: number; times: Array<{ date: string; rent: number | null; received: number | null; bookings: number | null }> };

const number = new Intl.NumberFormat('vi-VN');
const percent = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const displayDate = (value: string) => value.split('-').reverse().join('/');
export const displayCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? number.format(value) : '—';
export const displayMoney = (value: bigint | null) => value === null ? 'Chưa có dữ liệu' : number.format(value) + '\u00a0₫';
export const displayPercent = (value: number) => percent.format(value) + '%';

export function money(value: unknown): bigint | null {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

export function sumMoney(items: Performance[], key: MoneyKey) {
  if (!items.length) return null;
  let total = 0n;
  for (const item of items) {
    const value = money(item[key]);
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function occupancy(occupied: number, total: number) {
  return Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(occupied) && occupied >= 0 && occupied <= total
    ? occupied / total * 100 : null;
}

export function fraction(value: bigint, total: bigint) {
  return total > 0n ? Number(value * 100_000n / total) / 1000 : 0;
}
