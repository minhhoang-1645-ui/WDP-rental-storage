import { useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, CircleCheck, Minus, Plus } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { Button } from '@/operations/ui';
import { operationMutate } from '@/operations/mutate';
import { apiRequest, ApiError } from '@/services/api';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import type { FormAction } from '@/operations/form';
import { formatDate, formatMoney } from '@/utils/format';
import { JourneyNotice, JourneyScreen } from './customer-journey-ui';
import { DocumentAcceptance } from './document-acceptance';
import { ErrorState, LoadingState } from './screen-state';
import { StatusBadge } from './customer-ui';

const blue = '#0758DC';

export function CustomerRenewalForm({ action, onSaved, onClose, onBusyChange }: {
  action: FormAction; onSaved: (row: Row) => void; onClose: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const months = action.fields.find(field => field.name === 'termMonths')?.choices?.map(option => Number(option.value)) ?? [];
  const [index, setIndex] = useState(Math.max(0, months.indexOf(3)));
  const [plan, setPlan] = useState('PREPAID');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<Row>();
  const lock = useRef(false);
  const term = months[index];
  const end = action.renewal?.endDate ?? '';
  const policy = useResource<Row>(end ? '/business-policies/applied' : null);
  const renewalRule = object(rows(policy.data?.pricing).find(item => item.key === 'renewal')?.value);
  const date = new Date(end);
  const fromEnd = (days: number) => new Date(+date - days * 86_400_000).toISOString().slice(0, 10);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + term, 1));
  if (Number.isFinite(target.getTime())) {
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  }
  async function submit() {
    if (lock.current || !term || !action.transform) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const request = action.transform({ termMonths: term, paymentPlan: plan });
      if (!quote) {
        const query = new URLSearchParams({
          reservationId: text(request, 'reservationId'),
          rentalContractId: text(request, 'rentalContractId'),
          termMonths: String(term),
          paymentPlan: plan,
        });
        setQuote(await apiRequest<Row>('/customer/renewals/quote?' + query.toString()));
        return;
      }
      onSaved(await operationMutate(action.path, action.method, {
        ...request, expectedTotalAmount: quote.totalAmount, expectedEndDate: quote.requestedEndDate,
        expectedPricingVersion: quote.pricingVersion,
      }, true));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setQuote(undefined);
      setError(caught instanceof Error ? caught.message : 'Chưa gửi được yêu cầu gia hạn.');
    } finally {
      lock.current = false; setBusy(false); onBusyChange(false);
    }
  }
  return <View style={s.stack}>
    <Text style={s.title}>Gia hạn kho</Text>
    <View style={s.inline}><Text style={s.heading}>{action.renewal?.name || 'Kho đang thuê'}</Text><StatusBadge status="Đang hoạt động" tone="success" /></View>
    {Number(action.renewal?.quantity) > 1 ? <Text style={s.muted}>Áp dụng cho toàn bộ {action.renewal?.quantity} ô kho của đơn thuê.</Text> : null}
    <DateCard label="Hạn thuê hiện tại" value={end} />
    {Number.isFinite(+date) && typeof renewalRule.opensDaysBefore === 'number' && typeof renewalRule.closesDaysBefore === 'number' && <Text style={s.muted}>
      Có thể gửi yêu cầu từ {formatDate(fromEnd(renewalRule.opensDaysBefore))} đến {formatDate(fromEnd(Math.max(1, renewalRule.closesDaysBefore)))}.
      Đơn giá kỳ mới theo {renewalRule.priceMode === 'CONTRACT_RATE' ? 'giá hợp đồng' : 'giá niêm yết hiện hành'}.
    </Text>}
    <Text style={s.heading}>Thời gian gia hạn</Text>
    <View style={[s.card, s.spread]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Giảm thời gian gia hạn" disabled={busy || index <= 0} onPress={() => { setIndex(index - 1); setQuote(undefined); }} style={s.step}><Minus size={18} color={index <= 0 ? '#8491A5' : blue} /></Pressable>
      <Text style={s.heading}>{term} tháng</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tăng thời gian gia hạn" disabled={busy || index >= months.length - 1} onPress={() => { setIndex(index + 1); setQuote(undefined); }} style={s.step}><Plus size={18} color={index >= months.length - 1 ? '#8491A5' : blue} /></Pressable>
    </View>
    <DateCard label="Hạn thuê mới dự kiến" value={Number.isFinite(target.getTime()) ? target.toISOString().slice(0, 10) : ''} highlighted />
    <Text style={s.heading}>Kế hoạch thanh toán</Text>
    <View style={s.inline}>{['PREPAID', 'PAY_MONTHLY'].map(value =>
      <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: plan === value }} disabled={busy} onPress={() => { setPlan(value); setQuote(undefined); }}
        style={[s.card, s.choice, plan === value && s.selected]}>
        <Text style={[s.heading, plan === value && s.white]}>{value === 'PREPAID' ? 'Trả thẳng' : 'Trả hàng tháng'}</Text>
        <Text style={[s.muted, plan === value && s.white]}>{value === 'PREPAID' ? '1 lần' : term + ' tháng'}</Text>
      </Pressable>)}</View>
    <JourneyNotice title="Tiền cọc" message="Không thu thêm tiền cọc." success />
    {quote && <View style={s.card}>
      <Text style={s.heading}>Tổng phí gia hạn: {formatMoney(Number(quote.totalAmount))}</Text>
      <Text style={s.muted}>Tiền thuê trước giảm: {formatMoney(Number(quote.baseRentalAmount))}</Text>
      <Text style={s.muted}>Giảm giá: {formatMoney(Number(quote.discountAmount))}</Text>
      <Text style={s.muted}>Hạn thuê mới: {formatDate(text(quote, 'requestedEndDate'))}</Text>
    </View>}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Button title={busy ? 'Đang xử lý…' : quote ? 'Xác nhận và gửi yêu cầu' : 'Xem báo giá gia hạn'} disabled={busy || !term} onPress={() => void submit()} />
    <Button title="Hủy" variant="secondary" disabled={busy} onPress={onClose} />
  </View>;
}

function DateCard({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) {
  return <View style={[s.card, s.inline, highlighted && s.highlight]}>
    <CalendarDays size={22} color={blue} /><View><Text style={s.muted}>{label}</Text><Text style={[s.heading, highlighted && s.blue]}>{formatDate(value)}</Text></View>
  </View>;
}

export function CustomerRenewalDetail({ id }: { id: string }) {
  const source = useResource<Row>('/customer/renewals/' + encodeURIComponent(id), false, true);
  const row = source.data;
  const invoice = rows(row?.invoices).find(item => item.type === 'RENEWAL' && Number(item.renewalCycle) === 1 && idOf(item));
  const invoicePath = invoice ? '/customer/invoices/' + encodeURIComponent(idOf(invoice)) : '';
  const signed = Boolean(text(row ?? {}, 'appendix.acceptedAt'));
  const completed = row?.status === 'COMPLETED';
  const isCancelled = row?.status === 'CANCELLED';
  const approved = !isCancelled && row?.status === 'APPROVED_PENDING_PAYMENT';
  const payable = approved && signed && invoice && ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status)) && Number(invoice.balanceDue) > 0;
  const paymentConfig = useResource<Row>(payable ? '/customer/payment-config' : null);
  const gateway = paymentConfig.data?.payosConfigured === true ? 'payOS'
    : paymentConfig.data?.vnpayConfigured === true ? 'VNPay' : '';
  const rentalId = text(row ?? {}, 'reservation.id');
  const money = (value: unknown) => typeof value === 'number' ? formatMoney(value) : '—';
  const action = payable ? { title: gateway ? 'Thanh toán qua ' + gateway : 'Thanh toán gia hạn', path: invoicePath + '?renewalPayment=1' }
    : completed && rentalId ? { title: 'Xem chi tiết kho', path: '/customer/rentals/' + encodeURIComponent(rentalId) } : undefined;
  return <JourneyScreen title={approved ? signed ? 'Thanh toán gia hạn' : 'Phụ lục gia hạn' : 'Gia hạn kho'} action={action}>
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.loading ? <LoadingState layout="detail" /> : row ? <>
      {completed ? <View style={[s.card, s.complete]}><CircleCheck size={40} color="#15803D" /><Text style={s.heading}>Gia hạn thành công</Text>
        <Text style={s.muted}>Hạn thuê đã được cập nhật.</Text></View>
        : approved && !signed ? <JourneyNotice title="Yêu cầu đã được duyệt" message="Đọc và ký phụ lục để thanh toán hóa đơn gia hạn." />
        : !approved ? <StatusBadge status={isCancelled ? 'Đã hủy' : String(row.status)} /> : null}
      <Text style={s.title}>{payable ? 'Hóa đơn gia hạn' : text(row, 'reservation.storageType.name') || 'Kho thuê'}</Text>
      {payable ? <StatusBadge status={String(invoice.status)} /> : null}
      {payable ? <View style={[s.card, s.highlight]}><Text style={s.muted}>Số tiền phải thanh toán</Text><Text style={[s.title, s.blue]}>{money(invoice.balanceDue)}</Text></View> : null}
      <View style={s.card}>
        <Text style={s.heading}>Thông tin kỳ hạn</Text>
        <Fact label="Hạn cũ" value={formatDate(text(row, 'previousEndDate'))} />
        <Fact label="Gia hạn thêm" value={text(row, 'termMonths') + ' tháng'} />
        <Fact label={completed ? 'Hạn mới' : 'Hạn mới dự kiến'} value={formatDate(text(row, 'requestedEndDate'))} />
        {payable ? <Fact label="Kho áp dụng" value={text(row, 'reservation.storageType.name')} /> : null}
        {payable && gateway ? <Fact label="Phương thức thanh toán" value={gateway} /> : null}
        {completed && invoice && typeof invoice.amountPaid === 'number' ? <Fact label="Đã trả hóa đơn kỳ đầu" value={money(invoice.amountPaid)} /> : null}
      </View>
      {text(row, 'rejectionReason') ? <Text style={s.error}>{text(row, 'rejectionReason')}</Text> : null}
      {Boolean(row.appendix) && !payable && !isCancelled ? <DocumentAcceptance row={row} resource="renewals" onSaved={source.refresh} /> : null}
      {approved && signed && !invoice ? <ErrorState message="Chưa tìm thấy hóa đơn kỳ đầu của lần gia hạn này." onRetry={source.refresh} /> : null}
      {approved && signed && invoice?.status === 'PAID' ? <JourneyNotice title="Đã thanh toán hóa đơn" message="Đang cập nhật thời hạn thuê." /> : null}
    </> : null}
  </JourneyScreen>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={s.spread}><Text style={[s.muted, { flex: 1 }]}>{label}</Text><Text style={[s.heading, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text></View>;
}

export function openCreatedRenewal(row: Row) {
  if (idOf(row)) router.push(('/customer/renewals/' + encodeURIComponent(idOf(row))) as Href);
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card: { padding: 12, gap: 10, borderWidth: 1, borderColor: '#DCE3ED', borderRadius: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  heading: { fontSize: 15, fontWeight: '700', color: '#101828' },
  muted: { fontSize: 14, color: '#475569' },
  blue: { color: blue },
  white: { color: 'white' },
  highlight: { backgroundColor: '#EDF3FD', borderColor: '#EDF3FD' },
  complete: { backgroundColor: '#EAF8F0', alignItems: 'center' },
  choice: { flex: 1, gap: 3 },
  selected: { backgroundColor: blue, borderColor: blue },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EDF3FD', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#B42318' },
});
