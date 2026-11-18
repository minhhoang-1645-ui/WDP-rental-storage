import { ManagerParentLink } from '@/operations/manager-parent-link';
import { CustomerRecordSummary, CustomerRecordSections } from '@/components/customer-record';
import { ContractRenewalHistory } from '@/components/contract-renewal-history';
import { ContractTransferHistory } from '@/components/contract-transfer-history';
import { DocumentFile } from '@/components/document-file';
import { canAccessManagerReview, isManagerReviewWorkflow, managerReviewTitle } from '@/utils/manager-review-access';
import { staffRecordActions } from '@/portals/actions';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { recordActions } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, idOf, rows, text, operationRoot, resources, type Row } from './model';
import { RecordView } from './record-view';
import { useResource } from './use-resource';
import { Button, Disclosure, Navigation, styles } from './ui';
import { RenewalReview } from './renewal-review';
import { WorkflowHint } from '@/components/workspace-hub';
import { workflowGuide } from '@/utils/workflow-guide';
import { isTransferRequest } from '@/utils/transfer-request';
import { transferFromSupport, transferIntakeAllowed } from './transfer-inbox';
import { staffStyles } from '@/components/staff-ui';
import { StaffRecordSections } from '@/components/staff-record-sections';
import { HandoverDetail } from './handover-detail';

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
  const activeContracts = useResource<Row>(user?.role === 'STAFF' && resource === 'support-requests' && data.data && isTransferRequest(data.data) ? '/manager/contracts?status=ACTIVE' : null, true);
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
  if (user?.role === 'STAFF' && resource === 'appointments') {
    return <HandoverDetail row={row} loading={data.loading} error={data.error} refresh={refresh} userId={user.id} now={now} />;
  }
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" refreshControl={user?.role === 'STAFF' ? <RefreshControl refreshing={data.loading} onRefresh={() => { if (!action) refresh(); }} /> : undefined} contentContainerStyle={user?.role === 'STAFF' ? [staffStyles.page, { gap: 12, paddingBottom: 24 }] : styles.page}>
    {user?.role !== 'STAFF' && <PageHeader onRefresh={refresh} eyebrow={user?.role === 'MANAGER' && isManagerReviewWorkflow(resource) ? managerReviewTitle(resource) : config.title} title={config.title} description={user?.role === 'MANAGER' && isManagerReviewWorkflow(resource) ? 'Đối chiếu hồ sơ chuyển cấp hoặc kết quả chờ nghiệm thu; nhân viên thực hiện vận hành.' : 'Thông tin, lịch sử và thao tác theo vai trò của bạn.'} />}
    {user?.role === 'MANAGER' && <ManagerParentLink resource={resource} />}
    {user?.role !== 'STAFF' && <><Navigation mode="back-to" title="Về danh sách" path={`${root}/${resource}`} /></>}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {row?.isDemo === true && <Text style={styles.copy}>Đây là bản ghi mô phỏng có sẵn, không phải giao dịch ngân hàng thật. Không xác nhận nhận tiền cho bản ghi này.</Text>}
    {data.loading ? <LoadingState layout="detail" /> : data.error ? <ErrorState message={data.error} onRetry={refresh} /> : row && <>
      {user?.role !== 'STAFF' && <CustomerRecordSummary resource={resource} row={row}/>}
      {user?.role === 'STAFF' && <StaffRecordSections resource={resource} row={row} actionArea={<View style={{ gap: 10, paddingVertical: 12 }}>
        <Text style={staffStyles.section}>Kiểm tra và thao tác</Text>
        <Text style={staffStyles.secondary}>{workflowGuide(resource, row.status, 'staff')}</Text>
        {resource === 'renewals' && (action ? <RenewalReview row={row} /> : <Disclosure title="Đối chiếu gia hạn"><RenewalReview row={row} /></Disclosure>)}
        {action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : [...recordActions(resource, row, 'STAFF'), ...staffRecordActions(resource, row, user.id, now)].map((item, index) => <Button key={`${item.method}:${item.path}:${item.title}:${index}`} variant={index > 0 ? 'secondary' : 'primary'} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />)}
      {user?.role === 'STAFF' && resource === 'support-requests' && isTransferRequest(row) && (rows(row.transfers).find(transfer => transfer.status !== 'REJECTED') ? <Navigation title="Mở lệnh chuyển kho" path={`/staff/transfers/${encodeURIComponent(idOf(rows(row.transfers).find(transfer => transfer.status !== 'REJECTED')!))}`} /> : !action && !activeContracts.loading && !activeContracts.error && transferIntakeAllowed(row, rows(activeContracts.data?.items)) && <Button title="Tạo phiếu chuyển kho" onPress={() => setAction(transferFromSupport(row))} />)}
      {user?.role === 'STAFF' && resource === 'transfers' && row.status === 'COMPLETED' && (row.sourceMaintenanceMissing === true || text(row, 'supportRequest.id') && (text(row, 'supportRequest.status') !== 'RESOLVED' || text(row, 'supportRequest.resolutionType') === 'TRANSFER_RECOMMENDED')) && !action && <Button title="Đồng bộ kết quả cho khách" onPress={() => setAction({ title: 'Đồng bộ kết quả cho khách', path: `/staff/transfers/${encodeURIComponent(id)}/complete`, method: 'POST', idempotent: true, description: 'Cập nhật yêu cầu gốc cho lệnh đã hoàn tất; không chuyển kho lần nữa.', fields: [{ name: '_confirmed', title: 'Tôi xác nhận đồng bộ kết quả', checkbox: true, required: true, clientOnly: true }] })} />}
      </View>} />}
      {resource === 'contracts' && <ContractRenewalHistory contract={row} scope={user?.role === 'STAFF' ? 'staff/management' : 'manager'} />}
      {resource === 'contracts' && <ContractTransferHistory contract={row} scope={user?.role === 'STAFF' ? 'staff/management' : 'manager'} />}
      {(['contracts', 'invoices'].includes(resource) || resource === 'renewals' && Boolean(row.appendix)) && <DocumentFile path={`/${user?.role === 'STAFF' ? 'staff/management' : 'manager'}/documents/${resource}/${encodeURIComponent(id)}`} name={codeOf(row)} />}
      {resource === 'renewals' && user?.role !== 'STAFF' && <RenewalReview row={row} />}
      {user?.role !== 'STAFF' && <WorkflowHint text={workflowGuide(resource, row.status)} />}
      {resource === 'transfers' && text(row, 'sourceMaintenance.id') && <Navigation title="Xem bảo trì kho nguồn" path={`/staff/maintenance/${encodeURIComponent(text(row, 'sourceMaintenance.id'))}`} />}
      {user?.role !== 'STAFF' && (action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : recordActions(resource, row, user?.role ?? '').map((item, index) => <Button key={`${item.method}:${item.path}:${item.title}:${index}`} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />))}
      {Boolean(stock.error) && <ErrorState message={stock.error ?? ''} onRetry={stock.refresh} />}
      {user?.role !== 'STAFF' && <CustomerRecordSections row={row} root={root}/>}
      {resource === 'units' && <Text style={styles.copy}>Trạng thái cập nhật qua bàn giao, trả kho và nghiệm thu. Chỉ sửa vị trí kho chưa có hồ sơ.</Text>}
    </>}
  </ScrollView>;
}
