import { invoicePaymentBlockedBySchedule } from '@/utils/payment-state';
import { ManagerParentLink } from '@/operations/manager-parent-link';
import { canAccessManagerReview, isManagerReviewWorkflow, managerReviewStatus, managerReviewTitle } from '@/utils/manager-review-access';
import { isStaffWorkflow } from '@/utils/operation-access';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { createAction } from './actions';
import { OperationForm, type FormAction } from './form';
import { codeOf, idOf, label, operationRoot, resources, rows, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Disclosure, Field, Navigation, Panel, styles } from './ui';
import { RecordView, summary } from './record-view';
import { Availability } from './availability';
import { recordMatches } from '@/utils/record-search';
import { StaffLink, StaffStatusFilters, StaffTaskRow, staffStyles } from '@/components/staff-ui';
import { CustomerRecordRow } from '@/components/customer-record';
import { StaffTransfers } from './staff-transfers';

const staffReservationFilters = new Map<string, { search: string; status: string }>();

export function ResourceList({ resource: preset }: { resource?: string } = {}) {
  const params = useLocalSearchParams<{ resource: string }>();
  const { user } = useAuth();
  if (user?.role === 'STAFF' && (preset ?? params.resource) === 'transfers') return <StaffTransfers />;
  return <List key={`${user?.id}:${params.resource}`} resource={preset ?? String(params.resource)} />;
}
function List({ resource }: { resource: string }) {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ staffSearch?: string; staffStatus?: string }>();
  const staffReservation = user?.role === 'STAFF' && isStaffWorkflow(resource);
  const savedFilters = staffReservationFilters.get((user?.id ?? '') + ':' + resource);
  const config = Object.hasOwn(resources, resource) ? resources[resource] : undefined;
  const allowed = canAccessManagerReview(user?.role ?? '', resource);
  const reviewOnly = user?.role === 'MANAGER' && isManagerReviewWorkflow(resource);
  const reviewStatus = reviewOnly ? managerReviewStatus(resource) : '';
  const data = useResource<Row | Row[]>(allowed && config ? config.path + (reviewStatus ? '?status='+reviewStatus : '') : null, !config?.shape);
  const [search, updateSearch] = useState(staffReservation ? params.staffSearch ?? savedFilters?.search ?? '' : ''), [chosenStatus, updateStatus] = useState(staffReservation ? params.staffStatus ?? savedFilters?.status ?? '' : '');
  const setSearch = (value: string) => { updateSearch(value); if (staffReservation && user) { staffReservationFilters.set(user.id + ':' + resource, { search: value, status: chosenStatus }); router.setParams({ staffSearch: value }); } };
  const setStatus = (value: string) => { updateStatus(value); if (staffReservation && user) { staffReservationFilters.set(user.id + ':' + resource, { search, status: value }); router.setParams({ staffStatus: value }); } };
  const status = reviewStatus || chosenStatus;
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const root = operationRoot(user?.role ?? '');
  if (!allowed || !config) return <View style={styles.page}><EmptyState title="Không tìm thấy phân hệ" message="Đường dẫn không có trong khu vực này." /><Navigation title="Về tổng quan" path={root} /></View>;
  const items = rows(config.shape === 'array' ? data.data : (data.data as Row | undefined)?.[config.shape === 'catalog' ? 'products' : 'items']);
  const shown = items.filter(item => (resource !== 'invoices' || item.status !== 'OPEN' || Number(item.amountPaid) > 0 || !invoicePaymentBlockedBySchedule(item)) && (resource !== 'inquiries' || item.requestType === 'INQUIRY') && (!status || (item.status ?? item.rentalState ?? (item.isOverdue ? 'OVERDUE' : resource === 'rentals' ? 'ACTIVE' : '')) === status) && recordMatches(item, search));
  const create = (user?.role === 'STAFF' ? isStaffWorkflow(resource) : !isStaffWorkflow(resource)) ? createAction(resource) : undefined;
  if (create && user?.role === 'STAFF' && ['maintenance', 'transfers'].includes(resource)) create.path = `/staff/management/${resource}`;
  const header = <View style={{ gap: 12 }}><PageHeader eyebrow={user?.role === 'STAFF' ? 'Nhân viên vận hành' : 'Quản lý'} title={reviewOnly ? managerReviewTitle(resource) : config.title} description={reviewOnly ? "Chỉ hồ sơ cần quản lý quyết định; nhân viên tiếp nhận và thực hiện." : "Dữ liệu thực tế và thao tác theo quyền hiện có."} />
    {user?.role === 'MANAGER' && <ManagerParentLink resource={resource} />}
    {user?.role !== 'STAFF' && <Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading} />}
    {resource === 'maintenance' && user?.role === 'STAFF' && <Disclosure title="Hướng dẫn bảo trì"><Text style={styles.copy}>Tạo bảo trì trực tiếp cho kho trống. Với kho đang thuê, tiếp nhận sự cố và sắp xếp chuyển kho trước khi sửa. Phiếu được giao tự động khi kho đã có nhân viên phụ trách; nếu chưa có, quản lý phân công. Nhân viên thực hiện, gửi kết quả để quản lý nghiệm thu.</Text><Navigation title="Tra cứu kho đang thuê" path={`${root}/rentals`} /><Navigation title="Yêu cầu sự cố" path={`${root}/support-requests`} /></Disclosure>}
    {create && !action && <Button title={create.title} onPress={() => { setNotice(''); setAction(create); }} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); data.refresh(); }} />}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title="Tìm kiếm" value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && !reviewOnly && <StaffStatusFilters values={config.statuses} selected={status} onChange={setStatus}/>}
    {resource === 'catalog' && <><Text style={styles.copy}>Xem loại kho, kích thước và bảng giá đã được phê duyệt.</Text><Availability catalog={data.data as Row | undefined} root={root} /></>}
    {data.loading ? <LoadingState layout="list" /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{user?.role === 'STAFF' ? `${shown.length} hồ sơ phù hợp trong danh sách đã đồng bộ` : `${shown.length} / ${items.length} hồ sơ`}</Text>}
  </View>;
  return <FlatList refreshControl={user?.role === 'STAFF' ? <RefreshControl refreshing={data.loading} onRefresh={() => { if (!action) data.refresh(); }} /> : undefined} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={user?.role === 'STAFF' ? staffStyles.page : styles.page} data={data.error || data.loading ? [] : shown} keyExtractor={(item, index) => idOf(item) || String(index)} ListHeaderComponent={header} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : undefined} renderItem={({ item }) => config.shape === 'catalog' ? <Panel title={codeOf(item)}><RecordView row={item} root={root} /></Panel> : user?.role === 'STAFF' && isStaffWorkflow(resource) ? <StaffTaskRow resource={resource} row={item} /> : user?.role === 'STAFF' ? <View style={staffStyles.surface}><StaffLink title={codeOf(item)} description={summary(item)} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`} /></View> : <CustomerRecordRow resource={resource} row={item} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`}/>} />;
}
