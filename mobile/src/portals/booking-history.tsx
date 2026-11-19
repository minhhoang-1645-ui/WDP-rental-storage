import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { Box, CheckCircle2, ChevronRight, Search } from 'lucide-react-native';
import { CustomerStatusFilters } from '@/components/customer-record';
import { StatusBadge } from '@/components/customer-ui';
import { JourneyScreen } from '@/components/customer-journey-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { Navigation } from '@/operations/ui';
import { idOf, rows, text, type Row } from '@/operations/model';
import { bookingHistory, matchesHistorySearch } from '@/utils/booking-history';
import { formatDate } from '@/utils/format';

const blue = '#0758DC';
const terminal = ['CANCELLED', 'EXPIRED', 'REJECTED'];
type Entry = ReturnType<typeof bookingHistory>[number];

function name(entry: Entry) {
  const quantity = Number(entry.reservation.quantity);
  return quantity > 1 ? 'Đơn ' + quantity + ' kho' : text(entry.reservation, 'product.name') || 'Đơn đặt kho';
}

function badge(entry: Entry) {
  return <StatusBadge status={entry.phaseLabel} tone={terminal.includes(entry.phase) ? 'danger' :
    ['ACTIVE', 'RETURNED'].includes(entry.phase) ? 'success' : entry.phase === 'PAYMENT' ? 'warning' : 'info'} />;
}

const historyPath = (reference: string, milestones = false) =>
  ('/customer/booking-history?reference=' + encodeURIComponent(reference) + (milestones ? '&view=milestones' : '')) as Href;

export function CustomerBookingHistory() {
  const { reference, view } = useLocalSearchParams<{ reference?: string; view?: string }>();
  const reservations = useResource<Row[]>('/reservations', false, true);
  const contracts = useResource<Row>('/customer/contracts', true, true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const entries = bookingHistory(reservations.data ?? [], rows(contracts.data?.items));
  const shown = entries.filter(entry => matchesHistorySearch(entry.searchText, search) && (
    !filter || filter === 'Đã hủy' && entry.phase === 'CANCELLED' ||
    filter === 'Đã kết thúc' && ['RETURNED', 'EXPIRED', 'REJECTED'].includes(entry.phase) ||
    filter === 'Đang diễn ra' && !terminal.includes(entry.phase) && entry.phase !== 'RETURNED'));
  const loading = reservations.loading || contracts.loading;
  const error = reservations.error || contracts.error;
  const refresh = () => { reservations.refresh(); contracts.refresh(); };
  if (reference) {
    const entry = entries.find(item => item.reference === reference);
    if (entry) return <HistoryDetail entry={entry} milestones={view === 'milestones'} />;
    return <JourneyScreen title="Chi tiết lịch sử">{loading ? <LoadingState /> :
      <ErrorState message={error || 'Không tìm thấy đơn đặt kho.'} onRetry={refresh} />}</JourneyScreen>;
  }
  return <FlatList style={s.screen} contentContainerStyle={s.page} data={shown} keyExtractor={entry => entry.reference}
    keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic"
    refreshControl={<RefreshControl refreshing={loading && Boolean(reservations.data)} onRefresh={refresh} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <Stack.Screen options={{ title: 'Lịch sử đặt kho' }} />
      <View style={s.search}><Search size={18} color="#475569" />
        <TextInput accessibilityLabel="Tìm lịch sử đặt kho" placeholder="Tìm kho, mã đơn…" placeholderTextColor="#64748B"
          value={search} onChangeText={setSearch} style={s.input} />
      </View>
      <CustomerStatusFilters values={['Đang diễn ra', 'Đã kết thúc', 'Đã hủy']} selected={filter} onChange={setFilter} label={value => value} />
    </View>}
    ListEmptyComponent={loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> :
      <EmptyState title={entries.length ? 'Không tìm thấy đơn phù hợp' : 'Bạn chưa có lịch sử đặt kho'} message="" />}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push(historyPath(item.reference))}
      style={s.row}>
      <View style={s.icon}><Box size={23} color={blue} /></View>
      <View style={s.grow}><Text style={s.title}>{name(item)}</Text>
        <Text style={s.muted}>{formatDate(item.startDate)} – {formatDate(item.endDate)}</Text></View>
      {badge(item)}<ChevronRight size={16} color="#475569" />
    </Pressable>} />;
}

function HistoryDetail({ entry, milestones }: { entry: Entry; milestones: boolean }) {
  const bills = useResource<Row>(milestones ? null : '/customer/invoices', true);
  const visits = useResource<Row>('/customer/appointments', true);
  const returns = useResource<Row>(entry.phase === 'RETURNED' && !milestones ? '/customer/returns' : null, true);
  const related = (row: Row) => [text(row, 'reservation.reference'), text(row, 'reservation.id')].includes(entry.reference) ||
    entry.contracts.some(contract => Boolean(text(contract, 'reservation.id')) && text(contract, 'reservation.id') === text(row, 'reservation.id'));
  const bill = rows(bills.data?.items).find(row => row.type === 'INITIAL' && related(row));
  const appointment = rows(visits.data?.items).find(row => row.status === 'COMPLETED' && related(row)) ||
    rows(visits.data?.items).find(row => row.status === 'CONFIRMED' && related(row));
  const returned = rows(returns.data?.items).find(row => related(row) && text(row, 'physicallyReturnedAt'));
  const rentalPeriod = formatDate(entry.startDate) + ' – ' + formatDate(entry.endDate);
  const orderPath = '/customer/reservations/' + encodeURIComponent(entry.reference);
  const events = [
    { title: 'Gửi yêu cầu', date: text(entry.reservation, 'createdAt') },
    { title: 'Đơn được xác nhận', date: text(entry.reservation, 'confirmedAt') },
    ...entry.contracts.map(contract => ({ title: 'Ký hợp đồng' + (entry.contracts.length > 1 && text(contract, 'storageUnit.unitCode') ? ' · ' + text(contract, 'storageUnit.unitCode') : ''), date: text(contract, 'terms.acceptedAt') })),
    { title: 'Nhận bàn giao kho', date: text(appointment ?? {}, 'handover.completedAt', 'completedAt') },
    { title: 'Hủy đơn', date: text(entry.reservation, 'cancelledAt') },
  ].filter(event => event.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return <JourneyScreen title={milestones ? 'Các mốc đặt kho' : entry.phase === 'RETURNED' ? 'Đơn đã kết thúc' : 'Chi tiết lịch sử'}>
    <View style={s.summary}><View style={s.icon}><Box size={26} color={blue} /></View><View style={s.grow}>
      <Text style={s.heading}>{name(entry)}</Text>{badge(entry)}</View></View>
    <View style={s.panel}><Text style={s.muted}>Kỳ thuê</Text><Text style={s.title}>{rentalPeriod}</Text>
      {!milestones && <Text style={s.muted}>Ngày đặt · {formatDate(text(entry.reservation, 'createdAt'))}</Text>}
    </View>
    {milestones ? events.map((event, index) => <View style={s.summary} key={event.title + index}>
      <CheckCircle2 size={22} color="#15803D" /><View style={s.grow}><Text style={s.title}>{event.title}</Text>
        <Text style={s.muted}>{formatDate(event.date, true)}</Text></View>
    </View>) : <>
      {returned ? <><Text style={s.title}>Ngày trả kho · {formatDate(text(returned, 'physicallyReturnedAt'))}</Text>
        {text(returned, 'settlementStatus') ? <Navigation compact title="Tiền cọc"
          description={text(returned, 'settlementStatus') === 'SETTLED' ? 'Đã quyết toán' : 'Đang quyết toán'}
          path="/customer/deposit-settlements" /> : null}
        <Navigation title="Xem lịch sử hàng hóa" path={'/customer/stored-items' + (entry.contracts.length === 1 ? '?rentalContractId=' + encodeURIComponent(idOf(entry.contracts[0])) : '')} />
      </> : null}
      {terminal.includes(entry.phase) && text(entry.reservation, 'cancellationReason', 'rejectionReason') ?
        <Text style={s.muted}>{text(entry.reservation, 'cancellationReason', 'rejectionReason')}</Text> : null}
      {entry.contracts.map(contract => <Navigation key={idOf(contract)} compact title={'Hợp đồng · ' + (text(contract, 'terms.acceptedAt') ? 'Đã ký' : 'Chưa ký')}
        description={entry.contracts.length > 1 ? text(contract, 'storageUnit.unitCode') : undefined}
        path={'/customer/contracts/' + encodeURIComponent(idOf(contract))} />)}
      {bill ? <Navigation compact title={'Hóa đơn · ' + (({ PAID: 'Đã thanh toán', OPEN: 'Chưa thanh toán', PARTIALLY_PAID: 'Đã trả một phần', VOID: 'Đã hủy' } as Record<string, string>)[String(bill.status)] || 'Xem chi tiết')}
        path={'/customer/invoices/' + encodeURIComponent(idOf(bill))} /> : null}
      {appointment ? <Navigation compact title={appointment.status === 'COMPLETED' ? 'Bàn giao · Hoàn tất' : 'Lịch nhận · Đã xác nhận'}
        path={'/customer/appointments/' + encodeURIComponent(idOf(appointment))} /> : null}
      <Navigation compact title="Xem các mốc" path={historyPath(entry.reference, true)} />
    </>}
    <Navigation compact title="Xem đơn đặt" path={orderPath} />
  </JourneyScreen>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { padding: 16, gap: 10 },
  search: { borderWidth: 1, borderColor: '#D5DEEB', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 44, color: '#101828' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D5DEEB' },
  icon: { backgroundColor: '#EAF1FD', width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  title: { color: '#101828', fontSize: 15, fontWeight: '700' },
  heading: { color: '#101828', fontSize: 21, fontWeight: '700' },
  muted: { color: '#475569', fontSize: 13 },
  panel: { backgroundColor: '#F0F4FB', padding: 12, borderRadius: 12, gap: 6 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
