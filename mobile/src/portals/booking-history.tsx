import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { CustomerStatusFilters } from '@/components/customer-record';
import { StatusBadge } from '@/components/customer-ui';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { Disclosure, Facts, Field, Navigation, styles } from '@/operations/ui';
import { rows, text, type Row } from '@/operations/model';
import { bookingHistory, matchesHistorySearch } from '@/utils/booking-history';
import { formatDate, formatMoney } from '@/utils/format';

export function CustomerBookingHistory() {
  const reservations = useResource<Row[]>('/reservations');
  const contracts = useResource<Row>('/customer/contracts', true);
  const [search, setSearch] = useState(''), [phase, setPhase] = useState('');
  const entries = bookingHistory(reservations.data ?? [], rows(contracts.data?.items));
  const shown = entries.filter(entry => (!phase || entry.phase === phase) && matchesHistorySearch(entry.searchText, search));
  const loading = reservations.loading || contracts.loading, error = reservations.error || contracts.error;
  const refresh = () => { reservations.refresh(); contracts.refresh(); };
  return <FlatList refreshControl={<RefreshControl refreshing={loading&&Boolean(reservations.data)} onRefresh={refresh}/>} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}
    data={loading || error ? [] : shown} keyExtractor={item => item.reference}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <PageHeader eyebrow="Kho của bạn" title="Lịch sử đặt kho" description="Toàn bộ kho đã đặt, kho đang thuê, kho đã trả và yêu cầu đã hủy hoặc hết hạn." />
      <Field title="Tìm trong lịch sử" value={search} onChange={setSearch} maxLength={150} />
      <CustomerStatusFilters values={[...new Set(entries.map(entry=>entry.phase))]} selected={phase} onChange={setPhase} label={value=>entries.find(entry=>entry.phase===value)?.phaseLabel||value}/>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{shown.length} / {entries.length} đơn đặt kho</Text>}
    </View>}
    ListEmptyComponent={!loading && !error ? <EmptyState title={entries.length ? 'Không có lịch sử phù hợp' : 'Bạn chưa có lịch sử đặt kho'} message="Thử đổi từ khóa hoặc xem tất cả trạng thái." /> : null}
    renderItem={({ item }) => <View style={{gap:10,paddingVertical:14,borderBottomWidth:1,borderColor:'#D0D5DD'}}>
      <Text style={styles.title}>{text(item.reservation, 'product.name')}</Text>
      <StatusBadge status={item.phaseLabel} tone={['EXPIRED','CANCELLED','REJECTED'].includes(item.phase)?'danger':['ACTIVE','RETURNED'].includes(item.phase)?'success':['PAYMENT','PENDING'].includes(item.phase)?'warning':'info'}/><Text style={styles.copy}>{formatDate(item.startDate)} → {formatDate(item.endDate)}</Text><Text style={styles.copy}>{item.unitCodes.join(' · ')||item.reference}</Text><Navigation compact title="Xem đơn đặt kho" path={'/customer/reservations/'+encodeURIComponent(item.reference)}/><Disclosure title="Thông tin thời gian thuê">
      <Facts values={[
        ['Đặt ngày', formatDate(text(item.reservation, 'createdAt'))],
        ['Thời hạn theo hợp đồng / đơn', `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`],
        ['Số kho đã đặt', item.reservation.quantity], ['Kho được cấp theo hợp đồng', item.unitCodes.join(', ') || 'Chưa được cấp kho'],
        ['Báo giá tại thời điểm đặt', text(item.reservation, 'quote.quotedTotalAmount', 'quote.grandTotal') ? formatMoney(Number(text(item.reservation, 'quote.quotedTotalAmount', 'quote.grandTotal'))) : 'Xem báo giá trong đơn'],
      ]} /></Disclosure>
      <Disclosure title="Các mốc đặt kho">
        <Text style={styles.copy}>Đặt kho · {formatDate(text(item.reservation, 'createdAt'), true)}</Text>
        {Boolean(text(item.reservation, 'confirmedAt')) && <Text style={styles.copy}>Xác nhận · {formatDate(text(item.reservation, 'confirmedAt'), true)}</Text>}
        {item.phase === 'EXPIRED' && Boolean(text(item.reservation, 'expiresAt')) && <Text style={styles.copy}>Hết hạn giữ kho · {formatDate(text(item.reservation, 'expiresAt'), true)}</Text>}
        {item.contracts.map(contract => <View key={text(contract, 'id')} style={{ gap: 4 }}>
          <Navigation compact title={'Hợp đồng · '+text(contract,'contractCode')} path={'/customer/contracts/'+encodeURIComponent(text(contract,'id'))}/>
          {([['terms.acceptedAt', 'Ký hợp đồng'], ['activatedAt', 'Bắt đầu sử dụng kho'], ['completedAt', 'Kết thúc hợp đồng']] as const).map(([path, title]) => {
            const date = text(contract, path);
            return date ? <Text key={path} style={styles.copy}>{title} · {formatDate(date, true)}</Text> : null;
          })}
        </View>)}
      </Disclosure>
    </View>} />;
}
