import { first, money, object, rows, type Row } from '../../components/manager/portal-data';
import { useApiResource } from '../../services/useApiResource';

export function useRentalPolicy(account?: string) {
  return useApiResource<Row>(account ? '/business-policies/applied' : null, account, true);
}

function depositLabel(rule: Row): string {
  if (rule.method === 'NONE') return 'Không đặt cọc';
  if (typeof rule.amount !== 'number' || !Number.isFinite(rule.amount)) return '';
  switch (rule.method) {
    case 'FIXED_AMOUNT': return money(rule.amount) + ' mỗi kho';
    case 'RENT_PERCENTAGE': return rule.amount + '% tiền thuê trước giảm giá';
    case 'MONTHLY_RENT_MULTIPLIER': return rule.amount + ' tháng tiền thuê mỗi kho';
    default: return '';
  }
}

export function rentalTerms(type: Row, policy: ReturnType<typeof useRentalPolicy>): [string, string][] {
  const daily = type.allowDailyRental === true;
  const days = Number(type.minRentalDays);
  const size = first(type, 'sizeId');
  const rules = object(rows(policy.data?.pricing).find(item => item.key === 'deposit')?.value);
  const deposit = (group: string) => policy.error ? 'Không tải được chính sách tiền cọc'
    : policy.loading ? 'Đang tải chính sách tiền cọc…'
    : depositLabel(object(rules[group])) || 'Chưa có dữ liệu chính sách tiền cọc';
  const monthlyGroup = size === 'locker' ? 'locker' : 'other';
  return [
    ['Hình thức thuê', daily ? 'Theo ngày và theo tháng' : type.allowDailyRental === false ? 'Theo tháng' : 'Chưa có dữ liệu hình thức thuê'],
    ['Thuê tháng tối thiểu', '1 tháng'],
    [daily ? 'Thuê ngày tối thiểu' : 'Thuê theo ngày', daily
      ? Number.isInteger(days) && days >= 1 && days <= 30 ? days + ' ngày' : 'Cần thiết lập số ngày thuê tối thiểu'
      : type.allowDailyRental === false ? 'Không áp dụng' : '—'],
    ...(daily && size === 'small' ? [
      ['Tiền cọc khi thuê ngày', deposit('smallDaily')],
      ['Tiền cọc khi thuê tháng', deposit(monthlyGroup)],
    ] as [string, string][] : [['Tiền cọc', size ? deposit(monthlyGroup) : 'Chọn nhóm kho để xem chính sách'] as [string, string]]),
  ];
}
