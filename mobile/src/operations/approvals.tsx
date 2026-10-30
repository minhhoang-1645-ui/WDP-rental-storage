import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PageHeader } from '@/components/page-header';
import { TaskCard } from '@/components/task-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { codeOf, idOf, rows, text, type Row } from '@/operations/model';
import { Button, Field, Navigation, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';

const sources = [
  { resource: 'payment-submissions', title: 'Đối chiếu chuyển khoản', states: ['PENDING_VERIFICATION'] },
  { resource: 'deposit-settlements', title: 'Quyết toán cọc', states: ['PENDING_REVIEW', 'APPROVED'], accepts: (row: Row) => row.status === 'PENDING_REVIEW' || (row.status === 'APPROVED' && Number(row.refundAmount) > 0 && Number(row.outstandingAmount) === 0) },
  { resource: 'online-payment-reconciliations', title: 'Đối soát VNPay', states: ['PENDING_REVIEW', 'REFUND_REQUIRED'] },
  { resource: 'maintenance', title: 'Nghiệm thu bảo trì', states: ['AWAITING_VERIFICATION'] },
  { resource: 'support-requests', title: 'Hỗ trợ cần quyết định', states: ['ESCALATED'] },
] as const;

export function ApprovalInbox() {
  const payments = useResource<Row>('/manager/payment-submissions', true);
  const settlements = useResource<Row>('/manager/deposit-settlements', true);
  const reconciliations = useResource<Row>('/manager/online-payment-reconciliations', true);
  const maintenance = useResource<Row>('/manager/maintenance', true);
  const support = useResource<Row>('/manager/support-requests', true);
  const data = [payments, settlements, reconciliations, maintenance, support];
  const [search, setSearch] = useState('');
  const combined = data.flatMap((result, index) => {
    const source = sources[index];
    return rows(result.data?.items)
      .filter(row => (source.states as readonly string[]).includes(String(row.status)) && (!('accepts' in source) || !source.accepts || source.accepts(row)))
      .map(row => ({ ...row, source }));
  });
  const items = combined.filter(row => [codeOf(row), text(row, 'customer.fullName', 'reservation.customer.fullName', 'subject')].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const refresh = () => data.forEach(item => item.refresh());
  const loading = data.some(item => item.loading) && !data.some(item => item.data);
  const error = data.find(item => item.error)?.error;
  return <FlatList
    data={loading || error ? [] : items}
    keyExtractor={item => `${item.source.resource}:${idOf(item)}`}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.page}
    refreshControl={<RefreshControl refreshing={!loading && data.some(item => item.loading)} onRefresh={refresh} tintColor="#187D78" />}
    ListHeaderComponent={<View style={{ gap: 12 }}><PageHeader eyebrow="Quản lý" title="Hộp thư quyết định" description="Chỉ hiển thị các hồ sơ có thao tác thuộc quyền Manager. Gia hạn, chuyển kho, đặt kho và trả kho vật lý do Staff xử lý." /><Button title="Làm mới hộp thư" onPress={refresh} disabled={data.some(item => item.loading)} /><Field title="Tìm mã hồ sơ hoặc khách hàng" value={search} onChange={setSearch} maxLength={120} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{items.length} hồ sơ cần xem xét</Text>}<Navigation title="Đề nghị trả trước hạn" description="Quyết định trả trước hạn được xử lý theo luồng riêng." path="/manager/early-returns" /><Navigation title="Phân công nhân viên" description="Theo dõi tải công việc và giao nhân viên phụ trách." path="/manager/assignments" /></View>}
    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    ListEmptyComponent={!loading && !error ? <EmptyState title="Hộp thư đang trống" message="Không có yêu cầu đang chờ duyệt trong các luồng được backend hỗ trợ." /> : null}
    renderItem={({ item }) => <TaskCard item={item} kind={item.source.title} onPress={() => router.push(`/manager/${item.source.resource}/${encodeURIComponent(idOf(item))}`)} />}
  />;
}
