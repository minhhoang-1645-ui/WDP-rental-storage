import { isStaffWorkflow, isManagerResource } from '@/utils/operation-access';
import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { createAction } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, idOf, label, operationRoot, resources, rows, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Field, Navigation, Panel, styles } from './ui';
import { RecordView, summary } from './record-view';
import { Availability } from './availability';
import { TransferInbox } from './transfer-inbox';

export function ResourceList({ resource: preset }: { resource?: string } = {}) {
  const params = useLocalSearchParams<{ resource: string }>();
  const { user } = useAuth();
  return <List key={`${user?.id}:${params.resource}`} resource={preset ?? String(params.resource)} />;
}
function List({ resource }: { resource: string }) {
  const { user } = useAuth();
  const config = Object.hasOwn(resources, resource) ? resources[resource] : undefined;
  const allowed = user?.role === 'MANAGER' ? isManagerResource(resource) : user?.role === 'STAFF' && isStaffWorkflow(resource);
  const data = useResource<Row | Row[]>(allowed && config ? config.path : null, !config?.shape);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('');
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const root = operationRoot(user?.role ?? '');
  if (!allowed || !config) return <View style={styles.page}><EmptyState title="Không tìm thấy phân hệ" message="Đường dẫn không có trong khu vực này." /><Navigation title="Về tổng quan" path={root} /></View>;
  const items = rows(config.shape === 'array' ? data.data : (data.data as Row | undefined)?.[config.shape === 'catalog' ? 'products' : 'items']);
  const shown = items.filter(item => (resource !== 'inquiries' || item.requestType === 'INQUIRY') && (!status || (item.status ?? item.rentalState ?? (item.isOverdue ? 'OVERDUE' : resource === 'rentals' ? 'ACTIVE' : '')) === status) && (!search || JSON.stringify(item).toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))));
  const create = (user?.role === 'STAFF' ? isStaffWorkflow(resource) : !isStaffWorkflow(resource)) ? createAction(resource) : undefined;
  if (create && user?.role === 'STAFF' && ['maintenance', 'transfers'].includes(resource)) create.path = `/staff/management/${resource}`;
  const header = <View style={{ gap: 12 }}><PageHeader eyebrow={user?.role === 'STAFF' ? 'Nhân viên vận hành' : 'Quản lý'} title={config.title} description="Dữ liệu thực tế và thao tác theo quyền hiện có." />
    <Navigation title="Về tổng quan" path={root} />
    <Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading} />
    {resource === 'transfers' && user?.role === 'STAFF' && <TransferInbox transfers={items} onCreate={setAction} />}
    {resource === 'maintenance' && <Panel title="Bảo trì đúng tình trạng kho"><Text style={styles.copy}>Tạo bảo trì trực tiếp cho kho trống. Kho đang thuê cần báo sự cố và xử lý chuyển kho trước khi sửa. Sau khi tạo phiếu, quản lý phân công; nhân viên được giao bắt đầu, gửi kết quả và nghiệm thu.</Text><Navigation title="Tra cứu kho đang thuê" path={`${root}/rentals`} /><Navigation title="Yêu cầu sự cố" path={`${root}/support-requests`} /></Panel>}
    {create && !action && <Button title={create.title} onPress={() => { setNotice(''); setAction(create); }} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); data.refresh(); }} />}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title="Tìm kiếm" value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && <View style={styles.row}><Button variant={!status ? 'primary' : 'secondary'} title={!status ? '✓ Tất cả trạng thái' : 'Tất cả trạng thái'} onPress={() => setStatus('')} />{config.statuses.map(value => <Button key={value} variant={status === value ? 'primary' : 'secondary'} title={`${status === value ? '✓ ' : ''}${label(value)}`} onPress={() => setStatus(value)} />)}</View>}
    {resource === 'catalog' && <><Text style={styles.copy}>Xem loại kho, kích thước và bảng giá đã được phê duyệt.</Text><Availability catalog={data.data as Row | undefined} root={root} /></>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{shown.length} / {items.length} hồ sơ</Text>}
  </View>;
  return <FlatList keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={data.error || data.loading ? [] : shown} keyExtractor={(item, index) => idOf(item) || String(index)} ListHeaderComponent={header} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : null} renderItem={({ item }) => config.shape === 'catalog' ? <Panel title={codeOf(item)}><RecordView row={item} root={root} /></Panel> : <Navigation title={codeOf(item)} description={summary(item)} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`} />} />;
}
