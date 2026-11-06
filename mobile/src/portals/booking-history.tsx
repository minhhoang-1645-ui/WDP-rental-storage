import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { Button, Disclosure, Facts, Field, Navigation, styles } from '@/operations/ui';
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
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}
    data={loading || error ? [] : shown} keyExtractor={item => item.reference}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <PageHeader eyebrow="Kho của bạn" title="Lịch sử đặt kho" description="Toàn bộ kho đã đặt, kho đang thuê, kho đã trả và yêu cầu đã hủy hoặc hết hạn." />
      <Navigation title="Về tổng quan" path="/customer" />
      <Button title="Làm mới lịch sử" disabled={loading} onPress={refresh} />
      <Field title="Tìm trong lịch sử" value={search} onChange={setSearch} maxLength={150} />
      <Disclosure title="Lọc theo trạng thái"><View style={styles.row}><Button title={!phase ? '✓ Tất cả' : 'Tất cả'} variant={!phase ? 'primary' : 'secondary'} onPress={() => setPhase('')} />{[...new Map(entries.map(entry => [entry.phase, entry.phaseLabel]))].map(([key, title]) => <Button key={key} title={`${key === phase ? '✓ ' : ''}${title}`} variant={phase === key ? 'primary' : 'secondary'} onPress={() => setPhase(key)} />)}</View></Disclosure>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{shown.length} / {entries.length} đơn đặt kho</Text>}
    </View>}
    ListEmptyComponent={!loading && !error ? <EmptyState title={entries.length ? 'Không có lịch sử phù hợp' : 'Bạn chưa có lịch sử đặt kho'} message="Thử đổi từ khóa hoặc xem tất cả trạng thái." /> : null}
    renderItem={({ item }) => <View style={styles.card}>
      <Text style={styles.title}>{text(item.reservation, 'product.name')}</Text>
      <Text style={styles.label}>{item.reference} · {item.phaseLabel}</Text>
      <Facts values={[
        ['Đặt ngày', formatDate(text(item.reservation, 'createdAt'))],
        ['Thời hạn theo hợp đồng / đơn', `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`],
        ['Số kho đã đặt', item.reservation.quantity], ['Kho được cấp theo hợp đồng', item.unitCodes.join(', ') || 'Chưa được cấp kho'],
        ['Báo giá tại thời điểm đặt', text(item.reservation, 'quote.quotedTotalAmount', 'quote.grandTotal') ? formatMoney(Number(text(item.reservation, 'quote.quotedTotalAmount', 'quote.grandTotal'))) : 'Xem báo giá trong đơn'],
      ]} />
      <Disclosure title="Các mốc đặt kho">
        <Text style={styles.copy}>Đặt kho · {formatDate(text(item.reservation, 'createdAt'), true)}</Text>
        {Boolean(text(item.reservation, 'confirmedAt')) && <Text style={styles.copy}>Xác nhận · {formatDate(text(item.reservation, 'confirmedAt'), true)}</Text>}
        {item.phase === 'EXPIRED' && Boolean(text(item.reservation, 'expiresAt')) && <Text style={styles.copy}>Hết hạn giữ kho · {formatDate(text(item.reservation, 'expiresAt'), true)}</Text>}
        {item.contracts.map(contract => <View key={text(contract, 'id')} style={{ gap: 4 }}>
          <Text style={styles.label}>{[text(contract, 'contractCode'), text(contract, 'storageUnit.unitCode')].filter(Boolean).join(' · ')}</Text>
          {([['terms.acceptedAt', 'Ký hợp đồng'], ['activatedAt', 'Bắt đầu sử dụng kho'], ['completedAt', 'Kết thúc hợp đồng']] as const).map(([path, title]) => {
            const date = text(contract, path);
            return date ? <Text key={path} style={styles.copy}>{title} · {formatDate(date, true)}</Text> : null;
          })}
        </View>)}
      </Disclosure>
    </View>} />;
}
