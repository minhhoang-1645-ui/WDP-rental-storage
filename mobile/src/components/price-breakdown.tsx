import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { object, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

const values: [string, string][] = [
  ['Tiền thuê', 'rentalAmount'],
  ['Tiền cọc', 'depositAmount'],
  ['Giảm giá', 'discountAmount'],
  ['Tổng báo giá', 'quotedTotalAmount'],
  ['Cần thanh toán ngay', 'amountPayableNow'],
];

export function PriceBreakdown({ quote }: { quote: Row }) {
  const present = values.filter(([, key]) => typeof quote[key] === 'number');
  if (!present.length) return null;
  return <View style={styles.wrap}><Text style={styles.heading}>Báo giá từ hệ thống</Text>{present.map(([title, key]) => <View key={key} style={styles.row}><Text style={styles.label}>{title}</Text><Text selectable style={key === 'quotedTotalAmount' || key === 'amountPayableNow' ? styles.total : styles.value}>{formatMoney(Number(quote[key]))}</Text></View>)}{text(quote, 'billingMode', 'paymentPlan') ? <Text style={styles.note}>Kế hoạch: {text(quote, 'paymentPlan')} · Kết quả được xác nhận lại khi gửi yêu cầu.</Text> : null}</View>;
}

export const quoteFrom = (value: unknown) => object(value);

const styles = StyleSheet.create({
  wrap: { gap: WdpSpacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: WdpColors.border, paddingTop: WdpSpacing.sm },
  heading: { color: WdpColors.navy, fontSize: 15, fontWeight: '600' },
  row: { alignItems: 'center', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' },
  label: { color: WdpColors.muted, fontSize: 13 },
  value: { color: WdpColors.text, fontSize: 14, fontWeight: '500' },
  total: { color: WdpColors.navy, fontSize: 15, fontWeight: '700' },
  note: { color: WdpColors.muted, fontSize: 12, lineHeight: 18 },
});
