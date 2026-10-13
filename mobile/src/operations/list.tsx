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

export function ResourceList() {
  const params = useLocalSearchParams<{ resource: string }>();
  const { user } = useAuth();
  return <List key={`${user?.id}:${params.resource}`} resource={String(params.resource)} />;
}
function List({ resource }: { resource: string }) {
  const { user } = useAuth();
  const config = Object.hasOwn(resources, resource) ? resources[resource] : undefined;
  const allowed = ['MANAGER', 'ADMIN'].includes(user?.role ?? '');
  const data = useResource<Row | Row[]>(allowed && config ? config.path : null, !config?.shape);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('');
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const root = operationRoot(user?.role ?? '');
  if (!config) return <EmptyState title="Không tìm thấy phân hệ" message="Đường dẫn không có trong khu vực này." />;
  const items = rows(config.shape === 'array' ? data.data : (data.data as Row | undefined)?.[config.shape === 'catalog' ? 'products' : 'items']);
  const shown = items.filter(item => (!status || (item.status ?? item.rentalState ?? (item.isOverdue ? 'OVERDUE' : resource === 'rentals' ? 'ACTIVE' : '')) === status) && (!search || JSON.stringify(item).toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))));
  const create = createAction(resource);
  const header = <View style={{ gap: 12 }}><PageHeader eyebrow={user?.role === 'ADMIN' ? 'Quản trị · Vận hành' : 'Quản lý'} title={config.title} description="Dữ liệu thực tế và thao tác theo quyền hiện có." />
    <Navigation title="Về tổng quan" path={root} />
    <Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading} />
    {create && !action && <Button title={create.title} onPress={() => { setNotice(''); setAction(create); }} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); data.refresh(); }} />}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title="Tìm kiếm" value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && <View style={styles.row}><Button title={!status ? '✓ Tất cả trạng thái' : 'Tất cả trạng thái'} onPress={() => setStatus('')} />{config.statuses.map(value => <Button key={value} title={`${status === value ? '✓ ' : ''}${label(value)}`} onPress={() => setStatus(value)} />)}</View>}
    {resource === 'catalog' && <><Text style={styles.copy}>BE hiện chỉ cho xem loại kho, kích thước và giá. Chưa có API cập nhật các dữ liệu này.</Text><Availability catalog={data.data as Row | undefined} root={root} /></>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{shown.length} / {items.length} hồ sơ</Text>}
  </View>;
  return <FlatList keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={data.error || data.loading ? [] : shown} keyExtractor={(item, index) => idOf(item) || String(index)} ListHeaderComponent={header} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : null} renderItem={({ item }) => config.shape === 'catalog' ? <Panel title={codeOf(item)}><RecordView row={item} root={root} /></Panel> : <Navigation title={codeOf(item)} description={summary(item)} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`} />} />;
}
