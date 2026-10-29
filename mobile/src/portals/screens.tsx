import { isEarlyReturnRequest } from '@/utils/early-return';
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
import { paymentWindowClosed } from '@/utils/payment-state';
import { isTransferRequest } from '@/utils/transfer-request';
import { DocumentAcceptance } from '@/components/document-acceptance';

function transferProgress(row: Row) {
  const transfer = isTransferRequest(row) ? rows(row.transfers)[0] : undefined;
  if (!transfer) return '';
  const state = ({ REQUESTED: 'Chờ xác nhận kho mới', APPROVED: 'Đã duyệt · Chờ chuyển thực tế', COMPLETED: 'Đã chuyển kho', REJECTED: 'Chuyển kho chưa được chấp thuận' } as Record<string,string>)[text(transfer,'status')] || '';
  return `${state} · ${text(transfer,'fromUnit.unitCode')} → ${text(transfer,'toUnit.unitCode') || 'đang lựa chọn'}`;
}

function portalStatus(role: PortalRole, resource: string, value: unknown) {
  if (role === 'CUSTOMER' && value === 'OPEN') return resource === 'invoices' ? 'Chưa thanh toán' : 'Đang chờ tiếp nhận';
  if (role === 'CUSTOMER' && resource === 'reservations' && value === 'PENDING') return 'Chờ xác nhận';
  return label(value);
}

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
    <Stack.Screen options={{ title: config.title }} /><PageHeader eyebrow={role === 'STAFF' ? 'Nhân viên' : 'Tài khoản của tôi'} title={config.title} description={role === 'STAFF' ? 'Mở hồ sơ để đối chiếu thông tin và thực hiện công việc được phép.' : 'Thông tin và yêu cầu của riêng bạn tại NestBox.'} />
    <Navigation title="Về tổng quan" path={root} /><Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading || Boolean(action)} />
    {role === 'STAFF' && resource === 'maintenance' && !action && <Button title="Báo tình trạng cần bảo trì" onPress={() => setAction(staffMaintenanceCreate())} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã gửi yêu cầu.'); data.refresh(); }} />}
    {role === 'CUSTOMER' && ['appointments', 'contracts'].includes(resource) && <Navigation title={resource === 'appointments' ? 'Đặt lịch từ hợp đồng đủ điều kiện' : 'Xem lịch bàn giao'} path={resource === 'appointments' ? '/customer/contracts' : '/customer/appointments'} />}
    {role === 'CUSTOMER' && ['renewals', 'returns', 'support-requests', 'transfers'].includes(resource) && <><Navigation title="Gửi yêu cầu cho kho đang thuê" path="/customer/rentals" />{resource === 'returns' && <Navigation title="Xem quyết toán tiền cọc" path="/customer/deposit-settlements" />}{resource === 'support-requests' && <Navigation title="Hỗ trợ về hóa đơn" path="/customer/invoices" />}{resource === 'transfers' && <Text style={styles.copy}>Bạn có thể gửi nhu cầu chuyển kho qua mục Hỗ trợ. NestBox sẽ xác nhận kho mới và hướng dẫn bạn chuyển hàng.</Text>}</>}
    {role === 'CUSTOMER' && resource === 'invoices' && <><Navigation title="Lịch sử thanh toán" path="/customer/payment-history" /><Navigation title="Thông báo chuyển khoản" path="/customer/payment-submissions" /></>}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title="Tìm kiếm hồ sơ" value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && <View style={styles.row}><Button title={!status ? '✓ Tất cả' : 'Tất cả'} variant={!status ? 'primary' : 'secondary'} onPress={() => setStatus('')} />{config.statuses.map(value => <Button key={value} title={`${status === value ? '✓ ' : ''}${portalStatus(role, resource, value)}`} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />)}</View>}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <Text style={styles.copy}>{shown.length} / {items.length} hồ sơ</Text>}
  </View>} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Chưa có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : null} renderItem={({ item }) => <Navigation title={codeOf(item)} description={summary(item, transferProgress(item) || portalStatus(role, resource, item.status ?? item.rentalState))} path={`${root}/${resource}/${encodeURIComponent(idOf(item))}`} />} />;
}
export function PortalDetail({ role }: { role: PortalRole }) {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>(), { user } = useAuth();
  return <Detail key={`${user?.id}:${resource}:${id}`} role={role} resource={String(resource)} id={String(id)} />;
}
function Detail({ role, resource, id }: { role: PortalRole; resource: string; id: string }) {
  const { user } = useAuth(), config = portalResource(role, resource), allowed = user?.role === role, root = `/${role.toLowerCase()}`;
  const data = useResource<Row>(allowed && config ? `${config.path}/${encodeURIComponent(id)}` : null, false, role === 'CUSTOMER' && resource === 'invoices');
  const contracts = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'contracts' ? '/customer/contracts' : null, true);
  const appointments = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'contracts' ? '/customer/appointments' : null, true);
  const returns = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'rentals' ? '/customer/returns' : null, true);
  const earlyReturns = useResource<Row>(allowed && role === 'CUSTOMER' && resource === 'rentals' ? '/customer/support-requests' : null, true);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState(''), [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const sources = [contracts, appointments, returns, earlyReturns], sourceIssue = sources.find(item => item.error)?.error;
  const row = data.data, actions = row ? role === 'STAFF' ? staffRecordActions(resource, row, user?.id ?? '', clock) : resource === 'rentals' ? customerRentalActions(row, rows(returns.data?.items), clock, rows(earlyReturns.data?.items)).filter(item => !returns.loading && !returns.error && !earlyReturns.loading && !earlyReturns.error) : [] : [];
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
      {role === 'CUSTOMER' && resource === 'reservations' && row.status === 'CONFIRMED' && Boolean(row.expiresAt) && <WorkflowHint text={paymentWindowClosed({ type: 'INITIAL', reservation: row }, clock) ? 'Đã đến hạn giữ kho. Hãy kiểm tra lại trạng thái; nếu đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu.' : `Thanh toán trước ${formatDate(String(row.expiresAt), true)} (UTC+7) để giữ kho.`} />}
      {role === 'CUSTOMER' && resource === 'reservations' && row.status === 'CONFIRMED' && <><Navigation title="Xem và ký các hợp đồng" path="/customer/contracts" /><Navigation title="Xem hóa đơn và thanh toán" path="/customer/invoices" /></>}
      {role === 'CUSTOMER' && resource === 'contracts' && <DocumentAcceptance row={row} resource="contracts" onSaved={refresh} />}
      {role === 'CUSTOMER' && resource === 'renewals' && Boolean(row.appendix) && <DocumentAcceptance row={row} resource="renewals" onSaved={refresh} />}
      {resource === 'renewals' && <RenewalReview audience={role === 'CUSTOMER' ? 'customer' : 'internal'} row={role === 'CUSTOMER' ? { ...row, customer: user } : row} />}
      <WorkflowHint text={workflowGuide(resource, row.status, role === 'CUSTOMER' ? 'customer' : 'staff')} />
      {resource === 'returns' && (Number(text(row, 'inventory.remainingItemTypes')) > 0 || Number(text(row, 'inventory.pendingMovements')) > 0) && <Panel title="Cần hoàn tất giao nhận hàng"><Text style={styles.copy}>Còn {text(row, 'inventory.remainingItemTypes') || '0'} loại hàng và {text(row, 'inventory.pendingMovements') || '0'} phiếu đang xử lý. Khách cần lấy hết hàng, nhân viên kiểm đếm trước khi nhận trả kho.</Text><Navigation title="Xem phiếu nhập – xuất" path={`${root}/stock-movements`} /></Panel>}
      {role === 'CUSTOMER' && resource === 'renewals' && row.status === 'APPROVED_PENDING_PAYMENT' && <Navigation title="Xem hóa đơn & thanh toán gia hạn" path={rows(row.invoices).find(invoice => Number(invoice.renewalCycle) === 1)?.id ? `/customer/invoices/${encodeURIComponent(String(rows(row.invoices).find(invoice => Number(invoice.renewalCycle) === 1)!.id))}` : '/customer/invoices'} />}
      {role === 'CUSTOMER' && resource === 'renewals' && row.status === 'COMPLETED' && <Navigation title="Xem thời hạn thuê mới" path="/customer/rentals" />}
      {Boolean(transferProgress(row)) && <Panel title="Tiến độ chuyển kho"><Text style={styles.copy}>{transferProgress(row)}</Text><Text style={styles.copy}>{text(row, 'resolutionNote')}</Text></Panel>}
      <Panel title={role === 'CUSTOMER' ? 'Thông tin của bạn' : 'Thông tin đối chiếu'}><Facts values={[
        ['Trạng thái', portalStatus(role, resource, row.status ?? row.rentalState)], ['Khách hàng', text(row, 'customer.fullName', 'reservation.customer.fullName') || (role === 'CUSTOMER' ? user?.fullName : '')], ['Yêu cầu đặt kho', text(row, 'reservation.reference', 'reservationReference')], ['Hợp đồng', text(row, 'contractCode', 'contract.contractCode')], ['Kho', text(row, 'unit.unitCode', 'storageUnit.unitCode')], ['Kho nguồn', text(row, 'fromUnit.unitCode')], ['Kho đích', text(row, 'toUnit.unitCode')], ['Lịch hẹn', formatDate(text(row, 'scheduledAt'), true)], ['Nhân viên phụ trách', text(row, 'assignedStaff.fullName')], ['Tiêu đề', row.subject], ['Mô tả', row.description],
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
      {role === 'CUSTOMER' && resource === 'invoices' && <InvoicePayment key={id} invoice={row} refresh={refresh} onNotice={setNotice} />}
      {resource === 'rentals' && rows(earlyReturns.data?.items).filter(item => isEarlyReturnRequest(item) && text(item, 'reservation.id') === text(row, 'reservationId')).map(item => <Panel key={idOf(item)} title={item.earlyReturnDecision === 'APPROVED' ? 'Đã chấp thuận trả trước hạn' : item.earlyReturnDecision === 'REJECTED' ? 'Chưa chấp thuận trả sớm' : 'Đề nghị đang chờ quản lý'}><Text style={styles.copy}>{text(item, 'description')}</Text><Text style={styles.copy}>{text(item, 'resolutionNote') || 'Quản lý sẽ đối chiếu điều kiện và phản hồi.'}</Text></Panel>)}
      <Disclosure title="Chi tiết và lịch sử hồ sơ"><RecordView row={row} root={root} /></Disclosure>
    </>}
  </ScrollView>;
}
