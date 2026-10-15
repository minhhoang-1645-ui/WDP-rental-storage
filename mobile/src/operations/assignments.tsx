import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { codeOf, idOf, label, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Field, Navigation, styles } from './ui';

export function ManagerAssignments() {
  const support = useResource<Row>('/manager/support-requests', true);
  const maintenance = useResource<Row>('/manager/maintenance', true);
  const [search, setSearch] = useState(''), [kind, setKind] = useState(''), [assignment, setAssignment] = useState(''), [history, setHistory] = useState(false);
  const loading = support.loading || maintenance.loading, error = support.error || maintenance.error;
  const refresh = () => { support.refresh(); maintenance.refresh(); };
  const tasks: Row[] = [
    ...rows(support.data?.items).map(row => ({ ...row, resource: 'support-requests' })),
    ...rows(maintenance.data?.items).map(row => ({ ...row, resource: 'maintenance' })),
  ].filter(row => (history || !['RESOLVED', 'COMPLETED'].includes(text(row, 'status')))
    && (!kind || row.resource === kind)
    && (!assignment || Boolean(text(row, 'assignedStaff.id')) === (assignment === 'assigned'))
    && [codeOf(row), text(row, 'subject', 'description'), text(row, 'assignedStaff.fullName'), text(row, 'unit.unitCode', 'storageUnit.unitNumber')].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}
    data={loading || error ? [] : tasks} keyExtractor={row => `${row.resource}:${idOf(row)}`}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <PageHeader eyebrow="Quản lý" title="Phân công nhân viên" description="Mở hồ sơ hỗ trợ hoặc bảo trì để giao và đổi nhân viên phụ trách." />
      <Navigation title="Về tổng quan quản lý" path="/manager" />
      <Button title="Làm mới phân công" onPress={refresh} disabled={loading} />
      <Field title="Tìm công việc, kho hoặc nhân viên" value={search} onChange={setSearch} maxLength={120} />
      <View style={styles.row}>{[['', 'Tất cả nhóm'], ['support-requests', 'Hỗ trợ'], ['maintenance', 'Bảo trì']].map(([value, title]) => <Button key={value} title={`${kind === value ? '✓ ' : ''}${title}`} onPress={() => setKind(value)} />)}</View>
      <View style={styles.row}>{[['', 'Tất cả phân công'], ['assigned', 'Đã phân công'], ['unassigned', 'Chưa phân công']].map(([value, title]) => <Button key={value} title={`${assignment === value ? '✓ ' : ''}${title}`} onPress={() => setAssignment(value)} />)}</View>
      <Button title={history ? 'Đang xem cả lịch sử · Chỉ xem chưa hoàn tất' : 'Chỉ xem chưa hoàn tất · Xem cả lịch sử'} onPress={() => setHistory(value => !value)} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{tasks.length} công việc phù hợp</Text>}
    </View>}
    renderItem={({ item }) => <Navigation title={codeOf(item)} path={`/manager/${item.resource}/${encodeURIComponent(idOf(item))}`} description={`${label(item.status)} · ${text(item, 'assignedStaff.fullName') || 'Chưa phân công'}${text(item, 'assignedStaff.id') ? ` · Mã nhân viên: ${text(item, 'assignedStaff.id')}` : ''}`} />}
    ListEmptyComponent={!loading && !error ? <EmptyState title="Không có công việc phù hợp" message="Thử đổi bộ lọc hoặc xem cả lịch sử." /> : null} />;
}
