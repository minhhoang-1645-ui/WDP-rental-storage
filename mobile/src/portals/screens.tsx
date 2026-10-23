import { useEffect, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { codeOf, idOf, label, object, rows, text, type Row } from '@/operations/model';
import { RecordView, summary } from '@/operations/record-view';
import { RenewalReview } from '@/operations/renewal-review';
import { useResource } from '@/operations/use-resource';
import { Button, Disclosure, Facts, Field, Navigation, Panel, styles } from '@/operations/ui';
import { formatDate } from '@/utils/format';
import { customerAppointmentAction, customerRentalActions, customerSupportAction, handoverWindowIssue, staffMaintenanceCreate, staffRecordActions } from './actions';
import { portalResource, type PortalRole } from './resources';
import { InvoicePayment } from './invoice-payment';
import { WorkflowHint } from '@/components/workspace-hub';
import { workflowGuide } from '@/utils/workflow-guide';

export function PortalList({ role, resource: fixed }: { role: PortalRole; resource?: string }) {
  const params = useLocalSearchParams<{ resource: string }>(), { user } = useAuth();
  return <List key={`${user?.id}:${fixed ?? params.resource}`} role={role} resource={fixed ?? String(params.resource)} />;
}
function List({ role, resource }: { role: PortalRole; resource: string }) {
  const { user } = useAuth(), config = portalResource(role, resource), root = `/${role.toLowerCase()}`;
  const data = useResource<Row | Row[]>(user?.role === role && config ? config.path : null, config?.shape !== 'array');
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  if (!config) return <View style={styles.page}><EmptyState title="Không tìm thấy chức năng" message="Chọn chức năng trong khu vực của bạn." /><Navigation title="Về tổng quan" path={root} /></View>;
  const items = rows(config.shape === 'array' ? data.data : object(data.data).items).filter(item => role !== 'CUSTOMER' || resource !== 'transfers' || item.resolutionType === 'TRANSFER_RECOMMENDED' || text(item, 'subject').toLocaleLowerCase('vi').includes('chuyển kho'));
  const shown = items.filter(item => (!status || (item.status ?? item.rentalState) === status) && (!search || JSON.stringify(item).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
  return <FlatList keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} data={data.loading || data.error ? [] : shown} keyExtractor={(item, index) => idOf(item) || String(index)} ListHeaderComponent={<View style={{ gap: 12 }}>
    <Stack.Screen options={{ title: config.title }} /><PageHeader eyebrow={role === 'STAFF' ? 'Nhân viên' : 'Tài khoản của tôi'} title={config.title} description={role === 'STAFF' ? 'Mở hồ sơ để đối chiếu thông tin và thực hiện công việc được phép.' : 'Thông tin và yêu cầu của riêng bạn tại WDP.'} />
    <Navigation title="Về tổng quan" path={root} /><Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading || Boolean(action)} />
    {role === 'STAFF' && resource === 'maintenance' && !action && <Button title="Báo tình trạng cần bảo trì" onPress={() => setAction(staffMaintenanceCreate())} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã gửi yêu cầu.'); data.refresh(); }} />}
    {role === 'CUSTOMER' && ['appointments', 'contracts'].includes(resource) && <Navigation title={resource === 'appointments' ? 'Đặt lịch từ hợp đồng đủ điều kiện' : 'Xem lịch bàn giao'} path={resource === 'appointments' ? '/customer/contracts' : '/customer/appointments'} />}
    {role === 'CUSTOMER' && ['renewals', 'returns', 'support-requests', 'transfers'].includes(resource) && <><Navigation title="Gửi yêu cầu cho kho đang thuê" path="/customer/rentals" />{resource === 'returns' && <Navigation title="Xem quyết toán tiền cọc" path="/customer/deposit-settlements" />}{resource === 'support-requests' && <Navigation title="Hỗ trợ về hóa đơn" path="/customer/invoices" />}{resource === 'transfers' && <Text style={styles.copy}>Bạn có thể gửi nhu cầu chuyển kho qua mục Hỗ trợ. WDP sẽ xác nhận kho mới và hướng dẫn bạn chuyển hàng.</Text>}</>}
    {role === 'CUSTOMER' && resource === 'invoices' && <><Navigation title="Lịch sử thanh toán" path="/customer/payment-history" /><Navigation title="Thông báo chuyển khoản" path="/customer/payment-submissions" /></>}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title="Tìm kiếm hồ sơ" value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && <View style={styles.row}><Button title={!status ? '✓ Tất cả' : 'Tất cả'} variant={!status ? 'primary' : 'secondary'} onPress={() => setStatus('')} />{config.statuses.map(value => <Button key={value} title={`${status === value ? '✓ ' : ''}${label(value)}`} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />)}</View>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{shown.length} / {items.length} hồ sơ</Text>}
  </View>} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Chưa có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : null} renderItem={({ item }) => <Navigation title={codeOf(item)} description={summary(item)} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`} />} />;
}
export function PortalDetail({ role }: { role: PortalRole }) {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>(), { user } = useAuth();
  return <Detail key={`${user?.id}:${resource}:${id}`} role={role} resource={String(resource)} id={String(id)} />;
}
function Detail({ role, resource, id }: { role: PortalRole; resource: string; id: string }) {
  const { user } = useAuth(), config = portalResource(role, resource), allowed = user?.role === role, root = `/${role.toLowerCase()}`;
  const data = useResource<Row>(allowed && config ? `${config.path}/${encodeURIComponent(id)}` : null);
  const contracts = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'contracts' ? '/customer/contracts' : null, true);
  const appointments = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'contracts' ? '/customer/appointments' : null, true);
  const returns = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'rentals' ? '/customer/returns' : null, true);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState(''), [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const sources = [contracts, appointments, returns], sourceIssue = sources.find(item => item.error)?.error;
  const row = data.data, actions = row ? role === 'STAFF' ? staffRecordActions(resource, row, user?.id ?? '', clock) : resource === 'rentals' ? customerRentalActions(row, rows(returns.data?.items), clock).filter(item => item.path === '/customer/support-requests' || (!returns.loading && !returns.error)) : [] : [];
  if (role === 'CUSTOMER' && resource === 'contracts' && row && !sources.some(item => item.loading || item.error)) {
    const appointment = customerAppointmentAction(row, rows(contracts.data?.items), rows(appointments.data?.items), clock);
    if (appointment) actions.push(appointment);
    if (row.status === 'ACTIVE') actions.push(customerSupportAction(text(row, 'reservation.id'), { contractId: idOf(row) }));
  }
  if (!config) return <View style={styles.page}><EmptyState title="Không tìm thấy hồ sơ" message="Mở lại danh sách tương ứng." /><Navigation title="Về tổng quan" path={root} /></View>;
  if (role === 'CUSTOMER' && resource === 'reservations' && row) actions.push(customerSupportAction(idOf(row), { operational: false }));
  const refresh = () => { data.refresh(); sources.forEach(item => item.refresh()); };
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <Stack.Screen options={{ title: config.title }} /><PageHeader eyebrow={config.title} title={row ? codeOf(row) : 'Chi tiết hồ sơ'} description={role === 'CUSTOMER' ? 'Theo dõi trạng thái, thông tin và hướng dẫn cho yêu cầu của bạn.' : 'Đối chiếu thông tin và cập nhật kết quả công việc tại đây.'} /><Navigation title="Về danh sách" path={`${root}/${resource}`} /><Button title="Làm mới hồ sơ" onPress={refresh} disabled={data.loading || Boolean(action)} />
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : row && <>
      {resource === 'renewals' && <RenewalReview audience={role === 'CUSTOMER' ? 'customer' : 'internal'} row={role === 'CUSTOMER' ? { ...row, customer: user } : row} />}
      <WorkflowHint text={workflowGuide(resource, row.status, role === 'CUSTOMER' ? 'customer' : 'staff')} />
      <Panel title={role === 'CUSTOMER' ? 'Thông tin của bạn' : 'Thông tin đối chiếu'}><Facts values={[
        ['Trạng thái', label(row.status ?? row.rentalState)], ['Khách hàng', text(row, 'customer.fullName', 'reservation.customer.fullName') || (role === 'CUSTOMER' ? user?.fullName : '')], ['Yêu cầu đặt kho', text(row, 'reservation.reference', 'reservationReference')], ['Hợp đồng', text(row, 'contractCode', 'contract.contractCode')], ['Kho', text(row, 'unit.unitCode', 'storageUnit.unitCode')], ['Kho nguồn', text(row, 'fromUnit.unitCode')], ['Kho đích', text(row, 'toUnit.unitCode')], ['Lịch hẹn', formatDate(text(row, 'scheduledAt'), true)], ['Nhân viên phụ trách', text(row, 'assignedStaff.fullName')], ['Tiêu đề', row.subject], ['Mô tả', row.description],
        ...rows(row.allocatedUnits).map((item, index) => [`Kho bàn giao ${index + 1}`, `${text(item, 'unitCode')} · ${text(item, 'contractCode')}`] as [string, unknown]),
        ...rows(row.inspections).map((item, index) => [`Kiểm tra ${text(item, 'unit.unitCode') || index + 1}`, label(item.result)] as [string, unknown]),
      ].filter(([, value]) => value && value !== '—') as [string, unknown][]} /></Panel>
      {sources.some(item => item.loading) && <LoadingState />}{Boolean(sourceIssue) && <ErrorState message={sourceIssue!} onRetry={refresh} />}
      {role === 'CUSTOMER' && resource === 'rentals' && text(row, 'historicalPricing.billingMode') === 'DAILY' && <Text style={styles.copy}>Gia hạn hiện chỉ hỗ trợ kỳ thuê theo tháng. Kho thuê theo ngày vẫn có thể gửi hỗ trợ và trả kho khi hết kỳ.</Text>}
      {role === 'CUSTOMER' && resource === 'rentals' && Boolean(row.pendingRenewal) && <Navigation title="Xem yêu cầu gia hạn đang xử lý" path="/customer/renewals" />}
      {role === 'STAFF' && ['support-requests', 'maintenance'].includes(resource) && text(row, 'assignedStaff.id') !== user?.id && !['COMPLETED', 'RESOLVED'].includes(String(row.status)) && <Text style={styles.copy}>Chỉ nhân viên được phân công mới được xử lý công việc này.</Text>}
      {role === 'STAFF' && resource === 'appointments' && row.status === 'CONFIRMED' && Date.parse(text(row, 'scheduledAt')) > clock && <Text style={styles.copy}>Chưa đến giờ hẹn. Chỉ hoàn tất khi đã bàn giao thực tế đầy đủ.</Text>}
      {role === 'STAFF' && resource === 'appointments' && row.status === 'CONFIRMED' && handoverWindowIssue(row, clock) && <Text style={styles.error}>Ngày bàn giao thực tế nằm ngoài kỳ thuê. Không thể kích hoạt hợp đồng.</Text>}
      {action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : actions.map(item => <Button key={item.title} title={item.title} onPress={() => { setNotice(''); setAction(item); }} />)}
      {role === 'CUSTOMER' && resource === 'invoices' && <InvoicePayment key={`${id}:${row.status}:${row.balanceDue}`} invoice={row} refresh={refresh} onNotice={setNotice} />}
      <Disclosure title="Chi tiết và lịch sử hồ sơ"><RecordView row={row} root={root} /></Disclosure>
    </>}
  </ScrollView>;
}
