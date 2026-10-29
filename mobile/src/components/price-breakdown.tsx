import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { object, rows, label, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { serviceDisplayName } from '@/utils/service-labels';

const values: [string, string][] = [
  ['Tổng cả kỳ, gồm tiền cọc', 'quotedTotalAmount'],
  ['Dự kiến thanh toán lần đầu', 'estimatedInitialAmountDue'],
];

export function PriceBreakdown({ quote }: { quote: Row }) {
  const present = values.filter(([, key]) => typeof quote[key] === 'number');
  if (!present.length) return null;
  return <View style={styles.wrap}><Text style={styles.heading}>Chi tiết báo giá</Text>
    {rows(quote.lineItems).map((item, index) => <View key={text(item, 'code') || index}><View style={styles.row}><Text style={styles.label}>{serviceDisplayName(text(item,'code'),text(item,'label'))}</Text><Text selectable style={styles.value}>{typeof item.amount === 'number' ? formatMoney(item.amount) : 'Cần xác nhận'}</Text></View><Text style={styles.note}>{text(item, 'basis')}</Text></View>)}
    {rows(quote.services).map(service => <View key={text(service, 'serviceId', 'code')}><Text style={styles.label}>{serviceDisplayName(text(service,'code'),text(service, 'name'))}</Text><Text style={styles.note}>{typeof service.unitPrice === 'number' ? formatMoney(service.unitPrice) : 'Cần xác nhận'} / {label(service.billingUnit)} × {text(service, 'quantity')} · {text(service, 'serviceStartDate')} {text(service, 'serviceEndDate') ? 'đến ' + text(service, 'serviceEndDate') : ''}</Text></View>)}
    {present.map(([title, key]) => <View key={key} style={styles.row}><Text style={styles.label}>{title}</Text><Text selectable style={key === 'quotedTotalAmount' || key === 'estimatedInitialAmountDue' ? styles.total : styles.value}>{formatMoney(Number(quote[key]))}</Text></View>)}
    {Boolean(quote.initialPaymentBreakdown) && <View style={{gap:6}}><Text style={styles.heading}>Trong khoản thanh toán lần đầu</Text>{[['Tiền thuê kỳ đầu','rentalAmount'],['Tiền cọc thu một lần','depositAmount'],['Vật tư mua','purchaseAddOnAmount'],['Thiết bị đến kỳ tính phí','rentalAddOnAmount'],['Các kỳ sau dự kiến','remainingAmount']].filter(([,key])=>typeof object(quote.initialPaymentBreakdown)[key]==='number').map(([title,key])=><View key={key} style={styles.row}><Text style={styles.label}>{title}</Text><Text style={styles.value}>{formatMoney(Number(object(quote.initialPaymentBreakdown)[key]))}</Text></View>)}</View>}
    {Number(quote.prepaidDiscountPercent)>0 && <Text style={styles.note}>{quote.paymentPlan === 'PREPAID' ? 'Đã áp dụng' : 'Có thể chọn trả trước toàn kỳ để được'} chiết khấu {Number(quote.prepaidDiscountPercent)}% tiền thuê kho; không giảm tiền cọc hoặc dịch vụ.</Text>}<Text style={styles.note}>Phương án: {label(quote.paymentPlan)}. Tiền cọc không phải là thêm thời gian thuê. Số tiền phải trả thực tế được ghi trên hóa đơn sau khi đặt kho.</Text>
  </View>;
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
