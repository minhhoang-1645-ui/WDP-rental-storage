import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { recordActions } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, operationRoot, resources, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Navigation, styles } from './ui';

export function ResourceDetail() {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>();
  const { user } = useAuth();
  return <Detail key={`${user?.id}:${resource}:${id}`} resource={String(resource)} id={String(id)} />;
}
function Detail({ resource, id }: { resource: string; id: string }) {
  const { user } = useAuth();
  const config = Object.hasOwn(resources, resource) ? resources[resource] : undefined, root = operationRoot(user?.role ?? '');
  const allowed = ['MANAGER', 'ADMIN'].includes(user?.role ?? '');
  const data = useResource<Row>(allowed && config && resource !== 'catalog' ? `${config.path}/${encodeURIComponent(id)}` : null);
  const stock = useResource<Row>(allowed && resource === 'additional-services' ? `/manager/additional-services/${encodeURIComponent(id)}/inventory` : null);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const refresh = () => { data.refresh(); stock.refresh(); };
  if (!config || resource === 'catalog') return <EmptyState title="Không tìm thấy hồ sơ" message="Mở lại danh sách tương ứng." />;
  const row = data.data ? { ...data.data, ...(stock.data ? { inventory: stock.data } : {}) } : undefined;
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow={config.title} title={row ? codeOf(row) : 'Chi tiết hồ sơ'} description="Thông tin, lịch sử và thao tác nghiệp vụ." />
    <Navigation title="Về danh sách" path={`${root}/${resource}`} />
    <Button title="Làm mới hồ sơ" onPress={refresh} disabled={data.loading || Boolean(action)} />
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={refresh} /> : row && <>
      {action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : recordActions(resource, row, user?.role ?? '').map(item => <Button key={item.title} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />)}
      {Boolean(stock.error) && <ErrorState message={stock.error ?? ''} onRetry={stock.refresh} />}
      <RecordView row={row} root={root} />
      {resource === 'contracts' && <Navigation title="Lịch sử chuyển kho" path={`${root}/transfers`} />}
      {resource === 'units' && <Text style={styles.copy}>Trạng thái kho chỉ cập nhật qua bàn giao, trả kho và nghiệm thu. BE chưa có API chỉnh sửa thông tin kho.</Text>}
    </>}
  </ScrollView>;
}
