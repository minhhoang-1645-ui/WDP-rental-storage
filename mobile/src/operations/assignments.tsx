import { isEarlyReturnRequest } from '@/utils/early-return';
import { OperationForm, type FormAction } from './form';
import { assignmentAction } from './actions';
import { useAuth } from '@/auth/use-auth';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { codeOf, idOf, label, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Disclosure, Field, Navigation, styles } from './ui';
import { UnitStaffAssignments } from './unit-staff';
import { assignmentNeedsAttention, assignmentWorkRank } from '@/utils/work-queue';

export function ManagerAssignments() {
  const params = useLocalSearchParams<{ search?: string; kind?: string; assignment?: string }>();
  const { user } = useAuth();
  const allowed = user?.role === 'MANAGER';
  const support = useResource<Row>(allowed ? '/manager/support-requests' : null, true);
  const maintenance = useResource<Row>(allowed ? '/manager/maintenance' : null, true);
  const movements = useResource<Row>(allowed ? '/manager/stock-movements' : null, true);
  const [action, setAction] = useState<FormAction>();
  const [search, setSearch] = useState(params.search ?? ''), [kind, setKind] = useState(params.kind ?? ''), [assignment, setAssignment] = useState(params.assignment ?? ''), [history, setHistory] = useState(false);
  const loading = support.loading || maintenance.loading || movements.loading, error = support.error || maintenance.error || movements.error;
  const refresh = () => { support.refresh(); maintenance.refresh(); movements.refresh(); };
  const tasks: Row[] = [
    ...rows(movements.data?.items).map(row => ({ ...row, resource: 'stock-movements' })),
    ...rows(support.data?.items).filter(row => !isEarlyReturnRequest(row)).map(row => ({ ...row, resource: 'support-requests' })),
    ...rows(maintenance.data?.items).map(row => ({ ...row, resource: 'maintenance' })),
  ].filter(row => (history || !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(text(row, 'status')))
    && (!kind || row.resource === kind)
    && (!assignment || (assignment === 'attention' ? assignmentNeedsAttention(text(row, 'resource'), row) : Boolean(text(row, 'assignedStaff.id')) === (assignment === 'assigned')))
    && [codeOf(row), text(row, 'subject', 'description'), text(row, 'assignedStaff.fullName'), text(row, 'unit.unitCode', 'storageUnit.unitNumber')].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  tasks.sort((a, b) => assignmentWorkRank(a) - assignmentWorkRank(b) || (Date.parse(text(a, 'requestedAt', 'createdAt')) || 0) - (Date.parse(text(b, 'requestedAt', 'createdAt')) || 0));
  if (!allowed) return <View style={styles.page}><EmptyState title="Phân công thuộc khu vực quản lý" message="Mở đúng khu vực theo tài khoản của bạn." /><Navigation title="Về tổng quan" path="/manager" /></View>;
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}
    data={loading || error ? [] : tasks} keyExtractor={row => `${row.resource}:${idOf(row)}`}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <PageHeader eyebrow="Quản lý" title="Phân công nhân viên" description="Mở hồ sơ hỗ trợ, bảo trì hoặc nhập – xuất hàng để giao và đổi nhân viên phụ trách." />
      <Navigation title="Về tổng quan" path="/manager" />
      <Disclosure title="Phân công nhân viên phụ trách từng kho"><UnitStaffAssignments /></Disclosure>
      {action && <OperationForm key={action.path} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); refresh(); }} />}
      <Button title="Làm mới phân công" onPress={refresh} disabled={loading} />
      <Field title="Tìm công việc, kho hoặc nhân viên" value={search} onChange={setSearch} maxLength={120} />
      <View style={styles.row}>{[['', 'Tất cả nhóm'], ['support-requests', 'Hỗ trợ'], ['maintenance', 'Bảo trì'], ['stock-movements', 'Nhập – xuất hàng']].map(([value, title]) => <Button key={value} variant={kind === value ? 'primary' : 'secondary'} title={`${kind === value ? '✓ ' : ''}${title}`} onPress={() => setKind(value)} />)}</View>
      <View style={styles.row}>{[['', 'Tất cả phân công'], ['assigned', 'Đã phân công'], ['unassigned', 'Chưa phân công'], ['attention', 'Cần giao / đổi người']].map(([value, title]) => <Button key={value} variant={assignment === value ? 'primary' : 'secondary'} title={`${assignment === value ? '✓ ' : ''}${title}`} onPress={() => setAssignment(value)} />)}</View>
      <Button title={history ? 'Đang xem cả lịch sử · Chỉ xem chưa hoàn tất' : 'Chỉ xem chưa hoàn tất · Xem cả lịch sử'} onPress={() => setHistory(value => !value)} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <Text style={styles.copy}>{tasks.length} công việc phù hợp</Text>}
    </View>}
    renderItem={({ item }) => <View style={styles.card}><Text style={styles.title}>{codeOf(item)}</Text><Text style={styles.copy}>{label(item.status)} · {text(item, 'assignedStaff.fullName') || 'Chưa phân công'}</Text><Text style={styles.copy}>{text(item, 'subject', 'description', 'unit.unitCode', 'rentalContract.contractCode')}</Text>{text(item, 'assignedStaff.accountStatus') === 'DISABLED' && <Text style={styles.error}>Tài khoản phụ trách đã vô hiệu hóa; cần đổi người.</Text>}{!['COMPLETED','RESOLVED','CANCELLED'].includes(text(item, 'status')) && <Button title={text(item, 'assignedStaff.id') ? 'Đổi nhân viên phụ trách' : 'Phân công nhân viên'} onPress={() => setAction(assignmentAction(text(item, 'resource'), item))} />}</View>}

    ListEmptyComponent={!loading && !error ? <EmptyState title="Không có công việc phù hợp" message="Thử đổi bộ lọc hoặc xem cả lịch sử." /> : null} />;
}
