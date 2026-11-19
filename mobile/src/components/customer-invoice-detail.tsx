import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowLeft, Calendar, Check, ChevronRight, CreditCard, Headphones, History, Info } from 'lucide-react-native';
import { supportPath } from './customer-support';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { OnlinePayment } from '@/portals/online-payment';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { invoicePaymentBlockedBySchedule, paymentWindowClosed } from '@/utils/payment-state';
import { formatDate, formatMoney } from '@/utils/format';
import { DocumentFile } from './document-file';
import { InvoiceIdentity, outstanding } from './customer-invoice-list';
import { invoiceStyles as s } from './customer-invoice-styles';
import { EmptyState, LoadingState, ErrorState } from './screen-state';

const methods: Record<string, string> = { VNPAY: 'VNPay', CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản ngân hàng' };
const amount = (value: unknown) => typeof value === 'number' ? formatMoney(value) : '—';
const dateLabel = (date: string) => date ? formatDate(date) : '';

function Fact({ title, value, total = false }: { title: string; value: string; total?: boolean }) {
  return <View style={[s.fact, total && s.total]}><Text style={[total ? s.heading : s.body, s.grow]}>{title}</Text>
    <Text selectable style={total ? s.heading : s.body}>{value}</Text></View>;
}

export function CustomerInvoiceDetail({ id }: { id: string }) {
  const source = useResource<Row>('/customer/invoices/' + encodeURIComponent(id), false, true);
  const invoice = source.data;
  return invoice ? <InvoiceDetails key={id} invoice={invoice} refresh={source.refresh} /> : <>
    <Stack.Screen options={{ title: 'Chi tiết hóa đơn', headerTitleAlign: 'center' }} />
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      {source.loading ? <LoadingState layout="detail" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : <EmptyState title="Chưa tìm thấy hóa đơn" message="Về danh sách để chọn hóa đơn." />}
    </ScrollView>
  </>;
}

function InvoiceDetails({ invoice, refresh }: { invoice: Row; refresh: () => void }) {
  const { renewalPayment } = useLocalSearchParams<{ renewalPayment?: string }>();
  const [selecting, setSelecting] = useState(renewalPayment === '1' && invoice.type === 'RENEWAL');
  const [waiting, setWaiting] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const id = idOf(invoice);
  const paid = invoice.status === 'PAID';
  const voided = invoice.status === 'VOID';
  const payableBalance = outstanding(invoice);
  const bank = useResource<Row>(payableBalance ? '/customer/payment-config' : null);
  const submissions = useResource<Row>(payableBalance ? '/customer/payment-submissions' : null, true);
  const pendingTransfer = rows(submissions.data?.items).some(row => text(row, 'invoice.id') === id && row.status === 'PENDING_VERIFICATION');
  const unsigned = object(invoice.signing).complete === false;
  const holdExpired = paymentWindowClosed(invoice, now);
  const scheduled = invoicePaymentBlockedBySchedule(invoice, now);
  const supported = ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type));
  const eligible = Boolean(id && payableBalance && !unsigned && !holdExpired && !scheduled && supported && bank.data?.vnpayConfigured === true);
  const blocked = submissions.loading || Boolean(submissions.error) || pendingTransfer;
  const paymentScreen = selecting && payableBalance;
  const payments = rows(invoice.payments);
  const methodsRecorded = [...new Set(payments.map(row => methods[text(row, 'method')]).filter(Boolean))];
  const due = dateLabel(text(invoice, 'dueAt'));
  const paidAt = dateLabel(text(invoice, 'paidAt'));
  const unsignedContracts = rows(object(invoice.signing).contracts);
  const renewalId = text(invoice, 'signing.renewalId');
  const signPath = renewalId ? '/customer/renewals/' + encodeURIComponent(renewalId)
    : unsignedContracts.length === 1 ? '/customer/contracts/' + encodeURIComponent(idOf(unsignedContracts[0]))
      : '/customer/contracts?reservationId=' + encodeURIComponent(text(invoice, 'reservation.id'));
  useFocusEffect(useCallback(() => {
    if (!paymentScreen) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setSelecting(false); return true; });
    return () => listener.remove();
  }, [paymentScreen]));
  const reason = !payableBalance ? '' : holdExpired ? 'Đã hết hạn giữ kho cho đơn đặt này.'
    : scheduled ? 'Hóa đơn gia hạn chưa đến kỳ thanh toán.'
    : unsigned ? 'Bạn cần ký ' + (renewalId ? 'phụ lục gia hạn' : 'hợp đồng') + ' trước khi thanh toán.'
    : !supported ? 'Loại hóa đơn này chưa hỗ trợ thanh toán qua VNPay.'
    : pendingTransfer ? 'Có khoản chuyển trước đây đang chờ xác nhận.'
    : !bank.loading && !bank.error && bank.data?.vnpayConfigured !== true ? 'VNPay hiện chưa khả dụng.' : '';

  return <View style={s.screen}>
    <Stack.Screen options={{ title: paymentScreen ? 'Thanh toán hóa đơn' : 'Chi tiết hóa đơn', headerTitleAlign: 'center',
      headerTitleStyle: { color: C.navy, fontSize: 20, fontWeight: '700' },
      gestureEnabled: !paymentScreen,
      headerLeft: paymentScreen ? () => <Pressable style={s.history} accessibilityLabel="Quay lại chi tiết hóa đơn" accessibilityRole="button" onPress={() => setSelecting(false)}><ArrowLeft size={22} color={C.text} /></Pressable> : undefined,
    }} />
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      <InvoiceIdentity invoice={invoice} badge />
      <View style={[s.hero, paid ? s.greenBadge : voided ? s.grayBadge : null]}>
        <Text style={s.body}>{paymentScreen ? 'Số tiền thanh toán' : paid ? 'Tổng đã trả' : voided ? 'Giá trị hóa đơn đã hủy' : 'Còn phải trả'}</Text>
        <Text style={[s.heroAmount, paid && { color: C.success }, voided && { color: C.text }]}>
          {amount(paid ? invoice.amountPaid : voided ? invoice.totalAmount : invoice.balanceDue)}
        </Text>
        {!paymentScreen && paid && paidAt ? <View style={s.row}><Check size={17} color={C.success} /><Text style={s.body}>Ngày thanh toán: {paidAt}</Text></View> : null}
        {!paymentScreen && paid && methodsRecorded.length ? <View style={s.row}><CreditCard size={17} color={C.success} />
          <Text style={s.body}>{methodsRecorded.join(' · ')} · Đã xác nhận</Text></View> : null}
        {!paymentScreen && !paid && !voided && due ? <View style={s.row}><Calendar size={16} color={C.navy} /><Text style={s.body}>Đến hạn: {due}</Text></View> : null}
        {voided && text(invoice, 'voidReason') ? <Text style={s.muted}>{text(invoice, 'voidReason')}</Text> : null}
      </View>

      {paymentScreen ? <View style={s.section}>
        <Text accessibilityRole="header" style={s.title}>Phương thức thanh toán</Text>
        <View style={s.method} accessible accessibilityLabel="VNPay, tự động xác nhận">
          <View style={s.iconSmall}><Check size={20} color={C.navy} /></View>
          <View style={s.grow}><Text style={s.title}>VNPay / VNPay QR</Text><Text style={s.link}>Tự động xác nhận</Text></View>
          <CreditCard size={22} color={C.navy} />
        </View>
        <View style={[s.hero, s.row]}><Info size={20} color={C.navy} />
          <Text style={[s.body, s.grow]}>Bạn sẽ mở cổng VNPay để hoàn tất giao dịch. NestBox sẽ kiểm tra kết quả khi bạn quay lại.</Text></View>
      </View> : <>
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.title}>Chi tiết các khoản thu</Text>
          {([['Tiền thuê', invoice.rentalAmount], ['Tiền cọc', invoice.depositAmount], ['Dịch vụ', invoice.serviceAmount], ['Phí đã duyệt', invoice.chargeAmount]] as const)
            .filter(([, value]) => typeof value === 'number' && value !== 0).map(([title, value]) => <Fact key={title} title={title} value={amount(value)} />)}
          <Fact title="Tổng" value={amount(invoice.totalAmount)} total />
          {!paid && !voided && Number(invoice.amountPaid) > 0 ? <><Fact title="Đã trả" value={amount(invoice.amountPaid)} /><Fact title="Còn lại" value={amount(invoice.balanceDue)} /></> : null}
        </View>
        <View style={s.card}><DocumentFile title="Xem PDF hóa đơn" name={text(invoice, 'invoiceCode')} path={'/customer/documents/invoices/' + encodeURIComponent(id)} /></View>
        {payments.length ? <View style={s.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPayments }} style={[s.row, { minHeight: 44 }]} onPress={() => setShowPayments(value => !value)}>
            <History size={18} color={C.navy} /><Text style={[s.link, s.grow]}>{showPayments ? 'Ẩn giao dịch' : 'Xem giao dịch'}</Text><ChevronRight size={16} color={C.muted} />
          </Pressable>
          {showPayments ? payments.map(row => <View key={idOf(row)} style={s.fact}>
            <View style={s.grow}><Text style={s.heading}>{methods[text(row, 'method')] || 'Khoản thanh toán đã ghi nhận'}</Text>
              <Text style={s.muted}>{[dateLabel(text(row, 'receivedAt')), text(row, 'paymentCode')].filter(Boolean).join(' · ')}</Text></View>
            <Text style={s.body}>{amount(row.amount)}</Text>
          </View>) : null}
        </View> : null}
        <Pressable accessibilityRole="button" style={[s.hero, s.row]} onPress={() => router.push((supportPath + '/new?invoiceId=' + encodeURIComponent(id)) as Href)}>
          <Headphones size={21} color={C.cobalt} />
          <View style={s.grow}><Text style={s.heading}>Cần hỗ trợ về hóa đơn này?</Text>
            <Text style={s.muted}>Gửi yêu cầu để được kiểm tra và hỗ trợ</Text></View>
          <ChevronRight size={17} color={C.muted} />
        </Pressable>
      </>}

      {reason ? <Text accessibilityRole="alert" style={s.muted}>{reason}</Text> : null}
      {!paymentScreen && text(invoice, 'renewalRequest.id') ? <Pressable accessibilityRole="button" style={[s.card, s.row]}
        onPress={() => router.push(('/customer/renewals/' + encodeURIComponent(text(invoice, 'renewalRequest.id'))) as Href)}>
        <Calendar size={18} color={C.cobalt} /><Text style={[s.heading, s.grow]}>Xem yêu cầu gia hạn</Text><ChevronRight size={17} color={C.muted} />
      </Pressable> : null}
      {payableBalance && (bank.loading || submissions.loading) ? <LoadingState layout="compact" /> : null}
      {bank.error ? <ErrorState message={bank.error} onRetry={bank.refresh} /> : null}
      {submissions.error ? <ErrorState message={submissions.error} onRetry={submissions.refresh} /> : null}
    </ScrollView>
    <View style={s.footer}>
      <OnlinePayment invoiceId={id} invoiceType={String(invoice.type)} eligible={paymentScreen && eligible} disabled={blocked}
        paid={paid} refresh={refresh} onWaitingChange={setWaiting} actionTitle="Tiếp tục với VNPay" hidePaidSummary showStartAction={paymentScreen} />
    </View>
    {!paymentScreen && ((eligible && !blocked) || waiting && payableBalance || payableBalance && unsigned && !holdExpired && !scheduled) ? <View style={s.footer}>
      <Pressable accessibilityRole="button" style={s.action} onPress={() => {
        if (unsigned && !waiting) router.push(signPath as Href);
        else setSelecting(true);
      }}>
        <CreditCard size={19} color={C.onHero} />
        <Text style={[s.heading, s.white]}>{waiting ? 'Theo dõi VNPay' : unsigned ? 'Xem và ký ' + (renewalId ? 'phụ lục' : 'hợp đồng') : 'Thanh toán'}</Text>
      </Pressable>
    </View> : null}
  </View>;
}
