import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, ChevronUp, Info, X } from 'lucide-react-native';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';
import { quoteMonthlyPayments, quotePaymentSummary } from '@/utils/quote-payment-summary';

const blue = '#0758DC';
const money = (value: number | null) => value === null ? 'Chưa có báo giá' : formatMoney(value);
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function Line({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  return <View style={s.line}><Text style={[s.label, s.lineCopy]}>{title}</Text>
    <Text style={[s.strong, s.lineValue, typeof value === 'number' && value < 0 && s.saving]}>{typeof value === 'number' ? formatMoney(value) : String(value)}</Text></View>;
}

export function BookingBill({ quote }: { quote: Row }) {
  const [details, setDetails] = useState(false);
  const [laterExpanded, setLaterExpanded] = useState(false);
  const [detailLaterExpanded, setDetailLaterExpanded] = useState(false);
  const sum = quotePaymentSummary(quote);
  const initial = object(quote.initialPaymentBreakdown);
  const discount = amount(quote.discountAmount) ?? 0;
  const duration = typeof quote.termMonths === 'number' && quote.termMonths > 0 ? quote.termMonths + ' tháng'
    : typeof quote.billableDays === 'number' ? quote.billableDays + ' ngày' : '';
  const quantity = amount(quote.quantity);
  const monthlyUnitPrice = amount(quote.monthlyUnitPrice);
  const monthlyRent = monthlyUnitPrice !== null && quantity !== null && quantity > 0
    ? monthlyUnitPrice * quantity : sum.laterEach;
  const deposit = initial.depositAmount ?? quote.depositAmount;
  const early = object(object(object(quote.pricingPolicy).earlyReturn).value);
  const earlyFee = early.feeMethod === 'FIXED_AMOUNT' ? formatMoney(Number(early.feeAmount))
    : early.feeMethod === 'UNUSED_RENT_PERCENTAGE' ? `${early.feeAmount}% tiền thuê chưa sử dụng` : 'Miễn phí';
  const earlyRefund = early.refundMode === 'NONE' ? 'Không hoàn tiền thuê trả trước'
    : early.refundMode === 'ORIGINAL_DISCOUNT' ? 'Hoàn theo giá đã giảm' : 'Tính lại theo bảng ưu đãi đã cam kết';
  const daily = quote.billingMode === 'DAILY';
  const unitPrice = daily && typeof quote.dailyUnitPrice === 'string' && /^\d+(?:\.\d+)?$/.test(quote.dailyUnitPrice)
    ? Number(quote.dailyUnitPrice) : daily ? quote.dailyUnitPrice : monthlyUnitPrice;
  const totalLabel = Number(quote.depositAmount ?? deposit) > 0 ? 'Tổng cả kỳ (gồm cọc)' : 'Tổng cả kỳ';
  const remainingMonths = sum.monthly && typeof quote.termMonths === 'number' && Number.isSafeInteger(quote.termMonths)
    ? quote.termMonths - 1 : 0;
  const monthlyPayments = quoteMonthlyPayments(quote, monthlyRent);
  const laterTitle = remainingMonths > 0 ? `Còn phải trả trong ${remainingMonths} tháng sau` : 'Còn phải trả ở các kỳ sau';
  const summary = (expanded: boolean, toggle: () => void) => <View style={s.breakdown}>
    <Text style={s.strong}>Tóm tắt chi phí</Text>
    <Line title={daily ? 'Giá thuê 1 kho / ngày' : 'Giá thuê 1 kho / tháng'} value={unitPrice} />
    <Line title="Thời hạn thuê" value={duration} />
    {quantity !== null && quantity > 1 && <Line title="Số kho" value={quantity + ' kho'} />}
    <View style={s.panel}>
      <Text style={s.strong}>Trả lần đầu</Text>
      <Text style={[s.amount, s.firstAmount]}>{money(sum.first)}</Text>
      <Line title={sum.monthly ? 'Tiền thuê tháng đầu' : 'Tiền thuê cả kỳ'} value={initial.rentalAmount} />
      {Number(deposit) > 0 && <Line title="Tiền cọc" value={deposit} />}
      {Number(initial.purchaseAddOnAmount) > 0 && <Line title="Vật tư mua một lần" value={initial.purchaseAddOnAmount} />}
      {Number(initial.rentalAddOnAmount) > 0 && <Line title={sum.monthly ? 'Thiết bị tháng đầu' : 'Thiết bị cả kỳ'} value={initial.rentalAddOnAmount} />}
    </View>
    {sum.monthly && sum.remaining !== null && sum.remaining > 0 && <View style={s.panel}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${laterTitle}, ${money(sum.remaining)}`}
        onPress={toggle} style={s.disclosure}>
        <View style={s.lineCopy}><Text style={s.strong}>{laterTitle}</Text><Text style={s.amount}>{money(sum.remaining)}</Text></View>
        {expanded ? <ChevronUp color={blue} size={20} /> : <ChevronDown color={blue} size={20} />}
      </Pressable>
      {expanded && <View style={s.subtotal}>
        {sum.laterCount !== null && sum.laterEach !== null
          ? <Line title="Mỗi tháng sau trả" value={sum.laterEach} />
          : <>
            <Line title="Tiền thuê kho mỗi tháng" value={monthlyRent} />
            {monthlyPayments ? monthlyPayments.map(period => <View key={period.from} style={s.period}>
              <Text style={s.strong}>{period.from === period.to ? `Tháng ${period.from}` : `Tháng ${period.from}–${period.to}`}</Text>
              <Line title="Tiền thuê thiết bị mỗi tháng" value={period.equipment || 'Không phát sinh'} />
              <Line title="Mỗi tháng trả" value={period.total} />
            </View>) : <Text style={s.label}>Chi phí thiết bị từng tháng sẽ được thể hiện trên hóa đơn.</Text>}
          </>}
      </View>}
    </View>}
    <View style={s.panel}><Text style={s.strong}>{totalLabel}</Text><Text style={s.amount}>{money(sum.total)}</Text></View>
  </View>;
  return <View style={s.group}>
    {summary(laterExpanded, () => setLaterExpanded(value => !value))}
    <Text style={s.label}>Bạn sẽ thanh toán khoản đầu tiên sau khi ký hợp đồng.</Text>
    <Pressable accessibilityRole="button" style={s.link} onPress={() => { setDetailLaterExpanded(false); setDetails(true); }}>
      <Text style={s.linkText}>Xem chi tiết chi phí</Text><ChevronRight color={blue} size={17} />
    </Pressable>
    <Modal transparent visible={details} animationType="slide" onRequestClose={() => setDetails(false)}>
      <View style={s.overlay}><SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} /><View style={s.line}><Text style={s.title}>Chi tiết chi phí</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setDetails(false)} style={s.close}><X size={20} color="#18263B" /></Pressable></View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={[s.group, { paddingBottom: 12 }]}>
          {summary(detailLaterExpanded, () => setDetailLaterExpanded(value => !value))}
          <View style={s.breakdown}>
            <Text style={s.strong}>Chi phí toàn kỳ</Text>
            <Line title={discount ? 'Tiền thuê cả kỳ trước giảm giá' : 'Tiền thuê cả kỳ'} value={quote.baseRentalAmount ?? quote.rentalAmount} />
            {discount > 0 ? <Line title="Giảm giá trả thẳng" value={-discount} /> : null}
            {Number(quote.depositAmount) > 0 && <Line title="Tiền cọc" value={quote.depositAmount} />}
            {rows(quote.services).map((item, index) => <Line key={index} title={text(item, 'name') + (item.quantity ? ' × ' + String(item.quantity) : '')} value={item.amount} />)}
            {Number(quote.addOnTotalAmount) > 0 && <Line title="Tổng thiết bị và vật tư" value={quote.addOnTotalAmount} />}
          </View>
          {typeof early.feeMethod === 'string' && <View style={s.breakdown}>
            <Text style={s.strong}>Trả kho trước hạn</Text>
            <Line title="Phí trả kho trước hạn" value={earlyFee} />
            <Text style={s.label}>Hoàn tiền thuê trả trước</Text>
            <Text style={s.strong}>{earlyRefund}</Text>
          </View>}
          {Number(deposit) > 0 ? <View style={[s.panel, s.notice]}><Info size={18} color={blue} />
            <View style={s.noticeText}><Text style={s.strong}>Tiền cọc được đối chiếu khi trả kho</Text><Text style={s.label}>Hoàn cọc theo điều khoản trong hợp đồng.</Text></View></View> : null}
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  lineCopy: { flex: 1 },
  subtotal: { borderTopWidth: 1, borderColor: '#DCE3EC', marginTop: 4 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  period: { backgroundColor: '#F5F8FC', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 5 },
  breakdown: { borderWidth: 1, borderColor: '#DCE3EC', borderRadius: 12, padding: 10, gap: 3 },
  firstAmount: { color: blue, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  group: { gap: 8 }, panel: { backgroundColor: '#EDF3FD', borderRadius: 12, padding: 12, gap: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeText: { flex: 1, gap: 4 },
  saving: { fontSize: 15, fontWeight: '700', color: '#09672A' },
  amount: { color: blue, fontSize: 19, fontWeight: '800' }, title: { fontSize: 18, fontWeight: '800', color: '#18263B' },
  lineValue: { maxWidth: '55%', flexShrink: 1, textAlign: 'right' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5 },
  label: { fontSize: 13, color: '#40516A', flexShrink: 1 }, strong: { fontSize: 14, color: '#18263B', fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, linkText: { color: blue, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10182866' },
  sheet: { maxHeight: '85%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#B2BDCC', alignSelf: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
