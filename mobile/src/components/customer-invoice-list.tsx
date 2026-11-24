import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { Calendar, Check, ChevronRight, CreditCard, FileText, History, Search } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { formatDate, formatMoney } from '@/utils/format';
import { vietnamCalendarDate } from '@/utils/calendar-date';
import { invoicePaymentBlockedBySchedule, paymentWindowClosed } from '@/utils/payment-state';
import { useAuth } from '@/auth/use-auth';
import { readPendingOnlinePayment, type PendingOnlinePayment } from '@/services/online-payment-session';
import { EmptyState, ErrorState, LoadingState } from './screen-state';
import { invoiceStyles as s } from './customer-invoice-styles';

const titles: Record<string, string> = { INITIAL: 'Hóa đơn ban đầu', RECURRING: 'Tiền thuê định kỳ', RENEWAL: 'Hóa đơn gia hạn', SETTLEMENT: 'Quyết toán' };

export function invoiceTitle(invoice: Row) {
  const start = text(invoice, 'billingPeriodStart');
  return invoice.type === 'RECURRING' && /^\d{4}-\d{2}/.test(start)
    ? 'Tiền thuê tháng ' + Number(start.slice(5, 7))
    : titles[text(invoice, 'type')] || 'Hóa đơn';
}

export function invoiceContext(invoice: Row) {
  const quantity = Number(invoice.reservation && text(invoice, 'reservation.quantity'));
  const name = text(invoice, 'reservation.storageType.name');
  return [quantity > 1 ? quantity + ' kho' : '', name || text(invoice, 'reservation.reference')].filter(Boolean).join(' · ');
}

export function outstanding(invoice: Row) {
  return ['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status)) && Number(invoice.balanceDue) > 0;
}

function needsRenewalPayment(invoice: Row) {
  return invoice.type === 'RENEWAL' && Number(invoice.renewalCycle) === 1 &&
    text(invoice, 'renewalRequest.status') === 'APPROVED_PENDING_PAYMENT' &&
    !['CANCELLED', 'REJECTED'].includes(text(invoice, 'reservation.status')) &&
    outstanding(invoice) && !paymentWindowClosed(invoice) && !invoicePaymentBlockedBySchedule(invoice) &&
    object(invoice.signing).complete === true;
}

export function invoiceBadge(invoice: Row) {
  if (invoice.status === 'PAID') return { label: 'Đã thanh toán đủ', style: s.greenBadge };
  if (invoice.status === 'VOID') return { label: 'Đã hủy', style: s.grayBadge };
  if (invoice.status === 'PARTIALLY_PAID') return { label: 'Đã trả một phần', style: s.yellowBadge };
  if (paymentWindowClosed(invoice)) return { label: 'Hết hạn giữ kho', style: s.grayBadge };
  if (invoice.isPastDue === true || (text(invoice, 'dueAt') && text(invoice, 'dueAt').slice(0, 10) < vietnamCalendarDate())) return { label: 'Quá hạn', style: s.redBadge };
  if (needsRenewalPayment(invoice)) return { label: 'Cần thanh toán', style: s.yellowBadge };
  if (text(invoice, 'dueAt').slice(0, 10) > vietnamCalendarDate() && invoice.type !== 'INITIAL') return { label: 'Chưa đến hạn', style: s.blueBadge };
  return { label: invoice.status === 'OPEN' ? 'Chưa thanh toán' : 'Đang cập nhật', style: s.yellowBadge };
}

export function InvoiceIdentity({ invoice, badge = true }: { invoice: Row; badge?: boolean }) {
  const status = invoiceBadge(invoice);
  return <View style={[s.card, s.row]}>
    <View style={s.icon}><FileText size={22} color={C.navy} /></View>
    <View style={s.grow}><Text style={s.heading}>{invoiceTitle(invoice)}</Text>
      <Text style={s.muted}>{[text(invoice, 'invoiceCode'), invoiceContext(invoice)].filter(Boolean).join(' · ')}</Text></View>
    {badge ? <Text style={[s.badge, status.style]}>{status.label}</Text> : null}
  </View>;
}

export function InvoiceList() {
  const { user } = useAuth();
  const { reservationId, rentalContractId } = useLocalSearchParams<{ reservationId?: string; rentalContractId?: string }>();
  const source = useResource<Row>('/customer/invoices', true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(0);
  const [limit, setLimit] = useState(15);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PendingOnlinePayment | null>(null);
  useEffect(() => {
    let active = true;
    if (user?.id && !source.loading) void readPendingOnlinePayment(user.id)
      .then(value => { if (active) setPending(value); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id, source.loading]);

  const invoices = [...new Map(rows(source.data?.items).filter(item => {
    if (!idOf(item)) return false;
    if (!reservationId) return true;
    if (text(item, 'reservation.id') !== reservationId) return false;
    const contracts = rows(item.contracts);
    return !rentalContractId || item.type === 'INITIAL' || !contracts.length
      || contracts.some(contract => idOf(contract) === rentalContractId);
  }).map(item => [idOf(item), item])).values()];
  const today = vietnamCalendarDate();
  const due = invoices.filter(invoice => outstanding(invoice) && !paymentWindowClosed(invoice) &&
    (invoice.type === 'INITIAL' || needsRenewalPayment(invoice) || invoice.isPastDue === true || (text(invoice, 'dueAt') && text(invoice, 'dueAt').slice(0, 10) <= today)))
    .reduce((sum, invoice) => sum + Number(invoice.balanceDue), 0);
  const paid = invoices.reduce((sum, invoice) => sum + (Number(invoice.amountPaid) || 0), 0);
  const keyword = search.trim().toLocaleLowerCase('vi');
  const filtered = invoices.filter(invoice =>
    (filter === 0 || (filter === 1 && outstanding(invoice) && !paymentWindowClosed(invoice)) ||
      (filter === 2 && invoice.status === 'PAID') || (filter === 3 && invoice.status === 'VOID')) &&
    [invoiceTitle(invoice), invoiceContext(invoice), text(invoice, 'invoiceCode'), text(invoice, 'reservation.reference')]
      .some(value => value.toLocaleLowerCase('vi').includes(keyword)));
  const go = (id: string) => router.push(('/customer/invoices/' + encodeURIComponent(id)) as Href);

  return <>
    <Stack.Screen options={{ title: 'Hóa đơn', headerTitleAlign: 'center', headerTitleStyle: { fontSize: 20, fontWeight: '700', color: C.navy } }} />
    <FlatList style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"
      refreshing={refreshing && source.loading} onRefresh={() => { setRefreshing(true); source.refresh(); }}
      data={filtered.slice(0, limit)} keyExtractor={idOf}
      ListHeaderComponent={<View style={s.section}>
        <View style={s.filters}>
          <Pressable accessibilityRole="link" style={[s.row, s.chip]} onPress={() => router.push('/customer/payment-history')}>
            <History size={16} color={C.navy} /><Text style={s.link}>Lịch sử thanh toán</Text>
          </Pressable>
          <Pressable accessibilityRole="link" style={[s.row, s.chip]} onPress={() => router.push('/customer/payment-submissions')}>
            <CreditCard size={16} color={C.navy} /><Text style={s.link}>Thông báo chuyển khoản</Text>
          </Pressable>
        </View>
        {source.data ? <View style={[s.row, s.overview]}>
          <View style={[s.row, s.grow]}><View style={s.iconSmall}><CreditCard size={17} color={C.navy} /></View><View style={s.grow}>
            <Text style={s.muted}>Cần thanh toán hiện tại</Text><Text style={s.heading}>{formatMoney(due)}</Text>
          </View></View>
          <View style={s.divider} />
          <View style={[s.row, s.grow]}><View style={[s.iconSmall, s.greenBadge]}><Check size={17} color={C.success} /></View><View style={s.grow}>
            <Text style={s.muted}>Đã trả từ trước đến nay</Text><Text style={s.heading}>{formatMoney(paid)}</Text>
          </View></View>
        </View> : null}
        {pending ? <Pressable accessibilityRole="link" style={[s.card, s.row]} onPress={() => go(pending.invoiceId)}>
          <History size={17} color={C.navy} /><Text style={[s.link, s.grow]}>Theo dõi phiên VNPay</Text><ChevronRight size={16} color={C.muted} />
        </Pressable> : null}
        <View style={[s.card, s.search, s.row]}><Search size={18} color={C.muted} />
          <TextInput accessibilityLabel="Tìm hóa đơn" style={[s.body, s.grow]} placeholderTextColor={C.muted}
            maxLength={120} placeholder="Tìm tên hoặc mã hóa đơn…" value={search} onChangeText={value => { setSearch(value); setLimit(15); }} />
        </View>
        <View style={s.filters}>{['Tất cả', 'Còn phải trả', 'Đã trả đủ', 'Đã hủy'].map((label, index) =>
          <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: filter === index }}
            style={[s.chip, filter === index && s.activeChip]} onPress={() => { setFilter(index); setLimit(15); }}>
            <Text style={[s.chipText, filter === index && s.white]}>{label}</Text>
          </Pressable>)}</View>
      </View>}
      ListEmptyComponent={source.loading ? <LoadingState layout="list" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : <EmptyState title="Chưa có hóa đơn phù hợp" message="Hóa đơn của bạn sẽ xuất hiện tại đây." />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListFooterComponent={limit < filtered.length ? <Pressable accessibilityRole="button" style={s.history} onPress={() => setLimit(value => value + 15)}><Text style={s.link}>Xem thêm hóa đơn</Text></Pressable> : undefined}
      renderItem={({ item }) => {
        const badge = invoiceBadge(item);
        const date = text(item, item.status === 'PAID' ? 'paidAt' : 'dueAt');
        const amount = item.status === 'PAID' ? item.amountPaid : item.status === 'VOID' ? item.totalAmount : item.balanceDue;
        const amountLabel = item.status === 'PAID' ? 'Đã thanh toán' : item.status === 'VOID' ? 'Tổng hóa đơn' : 'Còn phải trả';
        return <Pressable accessibilityRole="button" onPress={() => go(idOf(item))} style={[s.card, s.row]}>
          <View style={s.icon}><FileText size={22} color={C.navy} /></View>
          <View style={s.grow}>
            <View style={s.row}><Text style={[s.heading, s.grow]}>{invoiceTitle(item)}</Text><Text style={[s.badge, badge.style]}>{badge.label}</Text></View>
            {typeof amount === 'number' && Number.isFinite(amount) ? <Text style={s.heading}>{amountLabel} · {formatMoney(amount)}</Text> : null}
            {item.status === 'PARTIALLY_PAID' && typeof item.amountPaid === 'number' ? <Text style={s.muted}>Đã thanh toán · {formatMoney(item.amountPaid)}</Text> : null}
            {invoiceContext(item) ? <Text style={s.muted}>{invoiceContext(item)}</Text> : null}
            {date && item.status !== 'VOID' ? <View style={s.row}><Calendar size={13} color={C.muted} />
              <Text style={s.muted}>{item.status === 'PAID' ? 'Đã trả ' : 'Đến hạn '}{formatDate(date)}</Text></View> : null}
          </View><ChevronRight size={16} color={C.muted} />
        </Pressable>;
      }}
    />
  </>;
}
