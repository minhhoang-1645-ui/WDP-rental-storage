import { canAccessManagerReview } from '@/utils/manager-review-access';
import { staffRecordActions } from '@/portals/actions';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { recordActions } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, idOf, rows, text, operationRoot, resources, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Navigation, styles } from './ui';
import { RenewalReview } from './renewal-review';
import { WorkflowHint } from '@/components/workspace-hub';
import { workflowGuide } from '@/utils/workflow-guide';
import { isTransferRequest } from '@/utils/transfer-request';
import { transferFromSupport } from './transfer-inbox';

export function ResourceDetail() {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>();
  const { user } = useAuth();
  return <Detail key={`${user?.id}:${resource}:${id}`} resource={String(resource)} id={String(id)} />;
}
function Detail({ resource, id }: { resource: string; id: string }) {
  const { user } = useAuth();
  const config = Object.hasOwn(resources, resource) ? resources[resource] : undefined, root = operationRoot(user?.role ?? '');
  const allowed = canAccessManagerReview(user?.role ?? '', resource);
  const data = useResource<Row>(allowed && config && resource !== 'catalog' ? `${config.path}/${encodeURIComponent(id)}` : null);
  const stock = useResource<Row>(allowed && resource === 'additional-services' ? `/manager/additional-services/${encodeURIComponent(id)}/inventory` : null);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resource !== 'appointments') return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [resource]);
  const refresh = () => { data.refresh(); stock.refresh(); };
  if (!allowed || !config || resource === 'catalog') return <View style={styles.page}><EmptyState title="Không tìm thấy hồ sơ" message="Mở lại danh sách tương ứng." /><Navigation title="Về tổng quan" path={root} /></View>;
  const row: Row | undefined = data.data ? { ...data.data, ...(stock.data ? { inventory: stock.data } : {}) } : undefined;
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow={config.title} title={row ? codeOf(row) : 'Chi tiết hồ sơ'} description="Thông tin, lịch sử và thao tác nghiệp vụ." />
    <Navigation title="Về danh sách" path={`${root}/${resource}`} />
    <Button title="Làm mới hồ sơ" onPress={refresh} disabled={data.loading || Boolean(action)} />
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {row?.isDemo === true && <Text style={styles.copy}>Đây là bản ghi mô phỏng có sẵn, không phải giao dịch ngân hàng thật. Không xác nhận nhận tiền cho bản ghi này.</Text>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={refresh} /> : row && <>
      {resource === 'renewals' && <RenewalReview row={row} />}
      <WorkflowHint text={workflowGuide(resource, row.status)} />
      {resource === 'support-requests' && isTransferRequest(row) && (rows(row.transfers).find(transfer => transfer.status !== 'REJECTED') ? <Navigation title="Mở lệnh chuyển kho" path={`/staff/transfers/${encodeURIComponent(idOf(rows(row.transfers).find(transfer => transfer.status !== 'REJECTED')!))}`} /> : !action && <Button title="Tạo lệnh chuyển từ yêu cầu này" onPress={() => setAction(transferFromSupport(row))} />)}
      {resource === 'transfers' && row.status === 'COMPLETED' && (row.sourceMaintenanceMissing === true || text(row, 'supportRequest.id') && (text(row, 'supportRequest.status') !== 'RESOLVED' || text(row, 'supportRequest.resolutionType') === 'TRANSFER_RECOMMENDED')) && !action && <Button title="Đồng bộ kết quả cho khách" onPress={() => setAction({ title: 'Đồng bộ kết quả cho khách', path: `/staff/transfers/${encodeURIComponent(id)}/complete`, method: 'POST', idempotent: true, description: 'Cập nhật yêu cầu gốc cho lệnh đã hoàn tất; không chuyển kho lần nữa.', fields: [{ name: '_confirmed', title: 'Tôi xác nhận đồng bộ kết quả', checkbox: true, required: true, clientOnly: true }] })} />}
      {resource === 'transfers' && text(row, 'sourceMaintenance.id') && <Navigation title="Xem bảo trì kho nguồn" path={`/staff/maintenance/${encodeURIComponent(text(row, 'sourceMaintenance.id'))}`} />}
      {action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : [...recordActions(resource, row, user?.role ?? ''), ...(user?.role === 'STAFF' ? staffRecordActions(resource, row, user.id, now) : [])].map(item => <Button key={item.title} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />)}
      {Boolean(stock.error) && <ErrorState message={stock.error ?? ''} onRetry={stock.refresh} />}
      <RecordView row={row} root={root} />
      {resource === 'units' && <Text style={styles.copy}>Thông tin kho hiện chỉ xem. Trạng thái cập nhật qua bàn giao, trả kho và nghiệm thu.</Text>}
    </>}
  </ScrollView>;
}
