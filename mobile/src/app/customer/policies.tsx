import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

const groups = [
  { title: 'Đặt kho và thanh toán', keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { title: 'Hợp đồng và bàn giao', keys: ['handoverLeadDays', 'renewal', 'returnNoticeDays', 'earlyReturn'] },
  { title: 'Quá hạn và nhắc nhở', keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

function details(policy: Row): string[] {
  if (typeof policy.value === 'number') return [policy.value + ' ' + text(policy, 'unit')];
  const v = object(policy.value);
  const n = (key: string) => text(v, key);
  const fee = (base: string) => v.feeMethod === 'NONE' ? 'Miễn phí' : v.feeMethod === 'FIXED_AMOUNT'
    ? formatMoney(Number(v.feeAmount)) : n('feeAmount') + '% ' + base;
  switch (policy.key) {
    case 'deposit':
      return Object.entries(v).map(([key, value]) => {
        const rule = object(value);
        const label = ({ locker: 'Tủ lưu trữ', smallDaily: 'Kho nhỏ thuê ngắn ngày', other: 'Các trường hợp còn lại' } as Record<string, string>)[key] ?? key;
        const amount = text(rule, 'amount');
        const charge = rule.method === 'NONE' ? 'Không cọc' : rule.method === 'FIXED_AMOUNT' ? formatMoney(Number(amount)) + '/ô'
          : rule.method === 'RENT_PERCENTAGE' ? amount + '% tiền thuê' : amount + ' tháng tiền thuê/ô';
        return label + ' · ' + charge;
      });
    case 'prepaid':
      return Object.entries(v).map(([term, rule]) => term + ' tháng · ' + (object(rule).enabled ? 'Giảm ' + text(object(rule), 'percent') + '%' : 'Không giảm'));
    case 'cancellation':
      return [`Trước ngày thuê từ ${n('farDays')} ngày · ${n('farPercent')}%`,
        `Trước từ ${n('nearDays')} đến dưới ${n('farDays')} ngày · ${n('middlePercent')}%`,
        `Trước ngày thuê dưới ${n('nearDays')} ngày · ${n('nearPercent')}%`,
        `Từ ngày thuê, kho chưa sử dụng · ${n('startedPercent')}%`, `Hạn hoàn tiền hủy đơn · ${n('refundDays')} ngày`];
    case 'renewal':
      return [`Mở trước ${n('opensDaysBefore')} ngày · Đóng trước ${n('closesDaysBefore')} ngày`,
        v.priceMode === 'CONTRACT_RATE' ? 'Áp dụng giá hợp đồng' : 'Áp dụng giá niêm yết hiện hành'];
    case 'earlyReturn':
      return [fee('tiền thuê chưa sử dụng'), v.refundMode === 'NONE' ? 'Không hoàn tiền thuê trả trước' : v.refundMode === 'ORIGINAL_DISCOUNT' ? 'Hoàn theo giá đã giảm' : 'Tính lại ưu đãi theo bảng đã cam kết'];
    case 'paymentOverdue':
      return [`Ân hạn ${n('graceDays')} ngày`, fee('tiền thuê còn nợ')];
    case 'returnOverdue':
      return [`Ân hạn ${n('graceDays')} ngày · Hệ số phí ${n('multiplier')}%`];
    default:
      return [];
  }
}

export default function CustomerPolicies() {
  const resource = useResource<Row>('/business-policies/applied');
  const policies = [...rows(resource.data?.items), ...rows(resource.data?.pricing)];
  return <ScrollView style={s.screen} contentContainerStyle={s.page}>
    <Stack.Screen options={{ title: 'Chính sách thuê kho' }} />
    {resource.loading ? <LoadingState label="Đang tải chính sách…" /> : resource.error
      ? <ErrorState message={resource.status === 404 ? 'Máy chủ chưa cung cấp mục chính sách thuê kho. Vui lòng thử lại sau.' : 'Hiện chưa tải được chính sách thuê kho. Vui lòng thử lại.'} onRetry={resource.refresh} />
      : <>
        <Text style={s.copy}>Quy định hiện hành của NestBox. Xem đơn đặt kho, hợp đồng hoặc hóa đơn để biết điều khoản áp dụng cho hồ sơ của bạn.</Text>
        {groups.map(group => <View key={group.title} style={s.group}>
          <Text accessibilityRole="header" style={s.heading}>{group.title}</Text>
          {policies.filter(policy => group.keys.includes(text(policy, 'key'))).map(policy => <View key={text(policy, 'key')} style={s.card}>
            <Text style={s.title}>{text(policy, 'title')}</Text>
            <Text style={s.copy}>{text(policy, 'description')}</Text>
            {details(policy).map((line, index) => <Text key={index} style={s.value}>{line}</Text>)}
            {text(policy, 'effectiveFrom') && <Text style={s.copy}>Phiên bản {text(policy, 'effectiveVersion')} · {new Date(text(policy, 'effectiveFrom')).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (UTC+7)</Text>}
          </View>)}
        </View>)}
      </>}
  </ScrollView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },
  page: { padding: 16, gap: 16 },
  group: { gap: 8 },
  heading: { color: '#175CD3', fontSize: 18, fontWeight: '700' },
  card: { padding: 12, gap: 5, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E4E7EC' },
  title: { color: '#101828', fontSize: 16, fontWeight: '700' },
  copy: { color: '#475467', lineHeight: 20 },
  value: { color: '#101828', lineHeight: 20 },
});
