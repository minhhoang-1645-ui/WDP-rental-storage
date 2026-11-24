import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Info, X } from 'lucide-react-native';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { quotePaymentSummary } from '@/utils/quote-payment-summary';

const blue = '#0758DC';
const money = (value: number | null) => value === null ? 'Chưa có báo giá' : formatMoney(value);
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function Line({ title, value, note }: { title: string; value: unknown; note?: string }) {
  if (value === null || value === undefined || value === '') return null;
  return <View style={s.line}><View style={s.lineCopy}><Text style={s.label}>{title}</Text>
    {note ? <Text style={s.note}>{note}</Text> : null}</View>
    <Text style={[s.strong, typeof value === 'number' && value < 0 && s.saving]}>{typeof value === 'number' ? formatMoney(value) : String(value)}</Text></View>;
}

export function BookingBill({ quote }: { quote: Row }) {
  const [details, setDetails] = useState(false);
  const sum = quotePaymentSummary(quote);
  const initial = object(quote.initialPaymentBreakdown);
  const discount = amount(quote.discountAmount) ?? 0;
  const duration = typeof quote.termMonths === 'number' && quote.termMonths > 0 ? quote.termMonths + ' tháng'
    : typeof quote.billableDays === 'number' ? quote.billableDays + ' ngày' : '';
  const unitPrice = amount(quote.billingMode === 'DAILY' ? Number(quote.dailyUnitPrice) : quote.monthlyUnitPrice);
  const unitRate = unitPrice !== null && unitPrice > 0 && typeof quote.quantity === 'number'
    ? formatMoney(unitPrice) + ' / ô / ' + (quote.billingMode === 'DAILY' ? 'ngày' : 'tháng') + ' · ' + quote.quantity + ' ô'
    : undefined;
  const deposit = initial.depositAmount ?? quote.depositAmount;
  const depositNote = 'Được đối chiếu khi trả kho theo điều khoản hợp đồng.';
  return <View style={s.group}>
    <View style={s.breakdown}>
    <Text style={s.title}>Chi tiết chi phí</Text>
    {sum.monthly ? <>
      <Text style={s.strong}>Lần đầu sau khi ký hợp đồng</Text>
      <Line title="Tiền thuê kỳ đầu" value={initial.rentalAmount} note={unitRate} />
      {Number(deposit) > 0 && <Line title="Tiền cọc" value={deposit} note={depositNote} />}
      {Number(initial.purchaseAddOnAmount) > 0 ? <Line title="Vật tư mua một lần" value={initial.purchaseAddOnAmount} /> : null}
      {Number(initial.rentalAddOnAmount) > 0 ? <Line title="Thiết bị kỳ đầu" value={initial.rentalAddOnAmount} /> : null}
      <Line title="Số tiền trả lần đầu" value={sum.first} />
      {sum.remaining !== null && sum.remaining > 0 ? <Line title="Tổng còn lại ở các kỳ sau" value={sum.remaining}
        note="Thanh toán theo từng hóa đơn đến hạn." /> : null}
    </> : <>
      <Line title={duration ? 'Tiền thuê kho · ' + duration : 'Tiền thuê kho'}
        value={discount > 0 ? quote.baseRentalAmount : quote.rentalAmount} note={unitRate} />
      {discount > 0 && <Line title="Giảm giá trả thẳng" value={-discount} />}
      {Number(quote.depositAmount) > 0 && <Line title="Tiền cọc" value={quote.depositAmount} note={depositNote} />}
      {rows(quote.services).map((item, index) => <Line key={index} title={text(item, 'name') + (item.quantity ? ' × ' + item.quantity : '')} value={item.amount} />)}
      {!rows(quote.services).length && Number(quote.addOnTotalAmount) > 0 && <Line title="Thiết bị và vật tư" value={quote.addOnTotalAmount} />}
    </>}
      <View style={[s.panel, s.line]}>
        <Text style={[s.strong, s.lineCopy]}>Tổng cả kỳ{Number(deposit) > 0 ? ' (gồm cọc)' : ''}</Text>
        <Text style={s.amount}>{money(sum.total)}</Text>
      </View>
    </View>
    <View style={[s.panel, s.notice]}><Info size={18} color={blue} />
      <View style={s.noticeText}><Text style={s.strong}>Bước này gửi yêu cầu đặt kho</Text>
        <Text style={s.label}>Bạn thanh toán theo hóa đơn sau khi ký hợp đồng.</Text></View>
    </View>
    <Pressable accessibilityRole="button" style={s.link} onPress={() => setDetails(true)}>
      <Text style={s.linkText}>Xem chi tiết chi phí</Text><ChevronRight color={blue} size={17} />
    </Pressable>
    <Modal transparent visible={details} animationType="slide" onRequestClose={() => setDetails(false)}>
      <View style={s.overlay}><SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} /><View style={s.line}><Text style={s.title}>Chi tiết chi phí</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setDetails(false)} style={s.close}><X size={20} color="#18263B" /></Pressable></View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={[s.group, { paddingBottom: 12 }]}>
          <Line title={quote.billingMode === 'DAILY' ? 'Đơn giá một kho / ngày' : 'Đơn giá một kho / tháng'}
            value={quote.billingMode === 'DAILY' && typeof quote.dailyUnitPrice === 'string' && /^\d+(?:\.\d+)?$/.test(quote.dailyUnitPrice)
              ? formatMoney(Number(quote.dailyUnitPrice)) : quote.billingMode === 'DAILY' ? quote.dailyUnitPrice : quote.monthlyUnitPrice} />
          <Line title="Số kho" value={typeof quote.quantity === 'number' ? quote.quantity + ' kho' : ''} />
          <Line title="Thời hạn thuê" value={duration} />
          <Line title={discount ? 'Tiền thuê trước giảm giá' : 'Tiền thuê'} value={quote.baseRentalAmount ?? quote.rentalAmount} />
          {discount > 0 ? <Line title="Giảm giá trả thẳng" value={-discount} /> : null}
          <Line title="Tiền cọc" value={quote.depositAmount} />
          {rows(quote.services).map((item, index) => <Line key={index} title={text(item, 'name') + (item.quantity ? ' × ' + String(item.quantity) : '')} value={item.amount} />)}
          <Line title="Tổng thiết bị và vật tư" value={quote.addOnTotalAmount} />
          <View style={s.panel}><Text style={s.strong}>Tổng dự kiến thanh toán (gồm cọc)</Text><Text style={s.amount}>{money(sum.total)}</Text></View>
          {Number(quote.depositAmount) > 0 ? <View style={[s.panel, s.notice]}><Info size={18} color={blue} />
            <View style={s.noticeText}><Text style={s.strong}>Tiền cọc được đối chiếu khi trả kho</Text><Text style={s.label}>Hoàn cọc theo điều khoản trong hợp đồng.</Text></View></View> : null}
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  lineCopy: { flex: 1, gap: 2 },
  note: { fontSize: 12, color: '#64748B' },
  breakdown: { borderWidth: 1, borderColor: '#DCE3EC', borderRadius: 12, padding: 10, gap: 3 },
  group: { gap: 8 }, panel: { backgroundColor: '#EDF3FD', borderRadius: 12, padding: 12, gap: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeText: { flex: 1, gap: 4 },
  green: { backgroundColor: '#E7F6E9' }, saving: { fontSize: 15, fontWeight: '700', color: '#09672A' },
  amount: { color: blue, fontSize: 19, fontWeight: '800' }, title: { fontSize: 18, fontWeight: '800', color: '#18263B' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5 },
  label: { fontSize: 13, color: '#40516A', flexShrink: 1 }, strong: { fontSize: 14, color: '#18263B', fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, linkText: { color: blue, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10182866' },
  sheet: { maxHeight: '85%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#B2BDCC', alignSelf: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
