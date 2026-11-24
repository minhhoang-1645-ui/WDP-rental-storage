import { roleNamespace } from '../role-names';
import { CustomerDepositDetail, CustomerDepositList } from '@/components/customer-deposits';
import { CustomerRenewalDetail } from '@/components/customer-renewal';
import { CustomerBookingList } from '@/components/customer-booking-list';
import { CustomerPaymentDetail, CustomerPaymentHistory } from '@/components/customer-payment-history';
import { InvoiceList } from '@/components/customer-invoice-list';
import { paymentWindowClosed } from '@/utils/payment-state';
import { CustomerWorkflowDetails } from '@/components/customer-workflow-details';
import { CustomerBookingDetail } from '@/components/customer-booking-detail';
import { CustomerRentals } from '@/components/customer-rentals';
import { CustomerContracts } from '@/components/customer-contracts';
import { CustomerAppointments } from '@/components/customer-appointments';
import { CustomerSupportCreate, CustomerSupportDetail, CustomerSupportList } from '@/components/customer-support';
import { CustomerInvoiceDetail } from '@/components/customer-invoice-detail';
import { CustomerRecordActions } from '@/components/customer-record-actions';
import { customerStyles } from '@/components/customer-premium';
import { CustomerReservationDocuments } from '@/components/customer-reservation-documents';
import { ContractRenewalHistory } from '@/components/contract-renewal-history';
import { CustomerRentalChange } from '@/components/customer-rental-change';
import { CustomerReturns } from '@/components/customer-returns';
import { ContractTransferHistory } from '@/components/contract-transfer-history';
import { DocumentFile } from '@/components/document-file';
import { isEarlyReturnRequest } from '@/utils/early-return';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CustomerRecordRow, CustomerRecordSummary, CustomerRecordSections, CustomerStatusFilters } from '@/components/customer-record';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { codeOf, idOf, label, object, rows, text, type Row } from '@/operations/model';
import { RecordView, summary } from '@/operations/record-view';
import { RenewalReview } from '@/operations/renewal-review';
import { useResource } from '@/operations/use-resource';
import { Button, Disclosure, Facts, Field, Navigation, Panel, styles } from '@/operations/ui';
import { formatDate, formatMoney } from '@/utils/format';
import { customerAppointmentAction, customerRentalActions, customerSupportAction, handoverWindowIssue, returnSettlementAmount, staffMaintenanceCreate, staffRecordActions } from './actions';
import { portalResource, type PortalRole } from './resources';
import { InvoicePayment } from './invoice-payment';
import { WorkflowHint } from '@/components/workspace-hub';
import { workflowGuide } from '@/utils/workflow-guide';
import { isTransferRequest } from '@/utils/transfer-request';
import { DocumentAcceptance } from '@/components/document-acceptance';
import { recordMatches } from '@/utils/record-search';

function transferProgress(row: Row) {
  const transfer = isTransferRequest(row) ? rows(row.transfers)[0] : undefined;
  if (!transfer) return '';
  const state = ({ REQUESTED: 'Chờ xác nhận kho mới', APPROVED: 'Đã duyệt · Chờ chuyển thực tế', COMPLETED: 'Đã chuyển kho', REJECTED: 'Chuyển kho chưa được chấp thuận' } as Record<string,string>)[text(transfer,'status')] || '';
  return `${state} · ${text(transfer,'fromUnit.unitCode')} → ${text(transfer,'toUnit.unitCode') || 'đang lựa chọn'}`;
}

function portalStatus(role: PortalRole, resource: string, value: unknown) {
  if (role === 'STORAGE_CUSTOMER' && value === 'OPEN') return resource === 'invoices' ? 'Chưa thanh toán' : 'Đang chờ tiếp nhận';
  if (role === 'STORAGE_CUSTOMER' && resource === 'reservations' && value === 'PENDING') return 'Chờ xác nhận';
  return label(value);
}

export function PortalList({ role, resource: fixed }: { role: PortalRole; resource?: string }) {
  const params = useLocalSearchParams<{ resource: string }>(), { user } = useAuth();
  const kind = fixed ?? params.resource;
  if (role === 'STORAGE_CUSTOMER' && kind === 'deposit-settlements') return <CustomerDepositList key={user?.id} />;
  if (role === 'STORAGE_CUSTOMER' && kind === 'returns') return <CustomerReturns key={user?.id} />;
  if (role === 'STORAGE_CUSTOMER' && (kind === 'transfers' || kind === 'early-returns')) return <CustomerRentalChange key={kind} kind={kind} />;
  if(role==='STORAGE_CUSTOMER'&&(fixed??params.resource)==='reservations')return <CustomerBookingList key={user?.id}/>;
  if(role==='STORAGE_CUSTOMER'&&(fixed??params.resource)==='contracts')return <CustomerContracts key={user?.id}/>;
  if (role === 'STORAGE_CUSTOMER' && (fixed ?? params.resource) === 'payment-history') return <CustomerPaymentHistory key={user?.id} />;
  if(role==='STORAGE_CUSTOMER'&&(fixed??params.resource)==='invoices')return <InvoiceList key={user?.id}/>;
  if(role==='STORAGE_CUSTOMER'&&(fixed??params.resource)==='appointments')return <CustomerAppointments key={user?.id}/>;
  if(role==='STORAGE_CUSTOMER'&&(fixed??params.resource)==='support-requests')return <CustomerSupportList key={user?.id}/>;
  return <List key={`${user?.id}:${fixed ?? params.resource}`} role={role} resource={fixed ?? String(params.resource)} />;
}
function List({ role, resource }: { role: PortalRole; resource: string }) {
  const { user } = useAuth(), config = portalResource(role, resource), root = `/${roleNamespace(role)}`;
  const data = useResource<Row | Row[]>(user?.role === role && config ? config.path : null, config?.shape !== 'array');
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const [pagination, setPagination] = useState({ filter: '', page: 1 });
  const filterKey = JSON.stringify([search, status]);
  const page = pagination.filter === filterKey ? pagination.page : 1;
  const setPage = (value: number) => setPagination({ filter: filterKey, page: value });
  if (!config) return <View style={styles.page}><EmptyState title="Không tìm thấy chức năng" message="Chọn chức năng trong khu vực của bạn." /><Navigation title="Về tổng quan" path={root} /></View>;
  const items = rows(config.shape === 'array' ? data.data : object(data.data).items);
  const filtered = items.filter(item => (!status || (item.status ?? item.rentalState) === status) && recordMatches(item, search, portalStatus(role, resource, item.status ?? item.rentalState)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  const shown = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  return <FlatList refreshControl={role==='STORAGE_CUSTOMER'?<RefreshControl refreshing={data.loading&&Boolean(data.data)} onRefresh={()=>{if(!action)data.refresh();}}/>:undefined} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={role==='STORAGE_CUSTOMER'?customerStyles.page:styles.page} data={data.loading || data.error ? [] : shown} keyExtractor={(item, index) => idOf(item) || String(index)} ListHeaderComponent={<View style={{ gap: 12 }}>
    <Stack.Screen options={{ title: config.title }} />{role==='STORAGE_CUSTOMER'?<View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text accessibilityRole="header" style={[customerStyles.title,{flex:1}]}>{config.title}</Text></View>:<><PageHeader eyebrow="Nhân viên" title={config.title} description="Mở hồ sơ để đối chiếu thông tin và thực hiện công việc được phép."/><Button title="Làm mới danh sách" onPress={data.refresh} disabled={data.loading||Boolean(action)}/></>}
    {role === 'FACILITY_STAFF' && resource === 'maintenance' && !action && <Button title="Báo tình trạng cần bảo trì" onPress={() => setAction(staffMaintenanceCreate())} />}
    {action && <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã gửi yêu cầu.'); data.refresh(); }} />}
    {role === 'STORAGE_CUSTOMER' && ['appointments', 'contracts'].includes(resource) && <Navigation title={resource === 'appointments' ? 'Đặt lịch từ hợp đồng đủ điều kiện' : 'Xem lịch bàn giao'} path={resource === 'appointments' ? '/customer/contracts' : '/customer/appointments'} />}
    {role === 'STORAGE_CUSTOMER' && ['renewals', 'returns'].includes(resource) && <><Navigation title={resource === 'renewals' ? 'Chọn kho muốn gia hạn' : 'Chọn kho muốn trả'} path="/customer/rentals" />{resource === 'returns' && <Navigation title="Xem quyết toán tiền cọc" path="/customer/deposit-settlements" />}</>}
    {role === 'STORAGE_CUSTOMER' && resource === 'returns' && <Panel title="Trước khi bàn giao"><Text style={styles.copy}>Khi trả trước hạn đã được duyệt, NestBox tính tiền thuê theo ngày bàn giao. Khách cần lấy hết hàng và trả lại chìa khóa hoặc quyền truy cập. Tiền cọc được xử lý riêng.</Text><Navigation title="Xem hóa đơn" path="/customer/invoices" /></Panel>}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    <Field title={role === 'STORAGE_CUSTOMER' ? 'Tìm trong danh sách' : 'Tìm kiếm hồ sơ'} value={search} onChange={setSearch} maxLength={120} />
    {config.statuses && (role === 'STORAGE_CUSTOMER' ? <CustomerStatusFilters values={config.statuses} selected={status} onChange={setStatus} label={value => portalStatus(role, resource, value)}/> : <Disclosure title={status ? "Bộ lọc · " + portalStatus(role, resource, status) : "Bộ lọc trạng thái"}><View style={styles.row}><Button title={!status ? '✓ Tất cả' : 'Tất cả'} variant={!status ? 'primary' : 'secondary'} onPress={() => setStatus('')} />{config.statuses.map(value => <Button key={value} title={`${status === value ? '✓ ' : ''}${portalStatus(role, resource, value)}`} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />)}</View></Disclosure>)}
    {data.loading ? <LoadingState layout="list" /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <View style={{ gap: 8 }}><Text style={styles.copy}>{filtered.length} hồ sơ · Trang {currentPage}/{totalPages}</Text>{totalPages > 1 && <View style={styles.row}><Button title="Trang trước" variant="secondary" disabled={currentPage <= 1} onPress={() => setPage(currentPage - 1)} /><Button title="Trang sau" variant="secondary" disabled={currentPage >= totalPages} onPress={() => setPage(currentPage + 1)} /></View>}</View>}
  </View>} ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Chưa có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc tải lại dữ liệu." /> : undefined} renderItem={({ item }) => {
    const id = idOf(item);
    const link = role === 'STORAGE_CUSTOMER' ? <CustomerRecordRow resource={resource} row={item} path={`${root}/${resource}/${encodeURIComponent(id)}`}/> : <Navigation title={codeOf(item)} description={summary(item, transferProgress(item) || portalStatus(role, resource, item.status ?? item.rentalState))} path={`${root}/${resource}/${encodeURIComponent(id)}`} />;
    return link;
  }} />;
}
export function PortalDetail({ role }: { role: PortalRole }) {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>(), { user } = useAuth();
  if (role === 'STORAGE_CUSTOMER' && resource === 'deposit-settlements') return <CustomerDepositDetail key={String(id)} id={String(id)} />;
  if (role === 'STORAGE_CUSTOMER' && resource === 'returns') return <CustomerReturns key={id} id={id} />;
  if (role === 'STORAGE_CUSTOMER' && (resource === 'transfers' || resource === 'early-returns')) return <CustomerRentalChange key={resource + '/' + id} kind={resource} id={id} />;
  if(role==='STORAGE_CUSTOMER'&&resource==='reservations') return <CustomerBookingDetail key={`${user?.id}:${id}`} id={String(id)}/>;
  if(role==='STORAGE_CUSTOMER'&&resource==='rentals') return <CustomerRentals key={`${user?.id}:${id}`} initialRentalId={String(id)}/>;
  if(role==='STORAGE_CUSTOMER'&&resource==='contracts')return <CustomerContracts key={`${user?.id}:${id}`} contractId={String(id)}/>;
  if(role==='STORAGE_CUSTOMER'&&resource==='appointments')return <CustomerAppointments key={`${user?.id}:${id}`} id={String(id)}/>;
  if(role==='STORAGE_CUSTOMER'&&resource==='support-requests')return id==='new'
    ? <CustomerSupportCreate key={user?.id} />
    : <CustomerSupportDetail key={`${user?.id}:${id}`} id={String(id)} />;
  if (role === 'STORAGE_CUSTOMER' && resource === 'payment-history') return <CustomerPaymentDetail key={`${user?.id}:${id}`} id={String(id)} />;
  if (role === 'STORAGE_CUSTOMER' && resource === 'renewals') return <CustomerRenewalDetail key={String(id)} id={String(id)} />;
  if(role==='STORAGE_CUSTOMER'&&resource==='invoices')return <CustomerInvoiceDetail key={`${user?.id}:${id}`} id={String(id)}/>;
  return <Detail key={`${user?.id}:${resource}:${id}`} role={role} resource={String(resource)} id={String(id)} />;
}
function Detail({ role, resource, id }: { role: PortalRole; resource: string; id: string }) {
  const { user } = useAuth(), config = portalResource(role, resource), allowed = user?.role === role, root = `/${roleNamespace(role)}`;
  const data = useResource<Row>(allowed && config ? `${config.path}/${encodeURIComponent(id)}` : null, false, role === 'STORAGE_CUSTOMER' && resource === 'invoices');
  const contracts = useResource<Row>(allowed && role === 'STORAGE_CUSTOMER' && resource === 'contracts' ? '/customer/contracts' : null, true);
  const appointments = useResource<Row>(allowed && role === 'STORAGE_CUSTOMER' && resource === 'contracts' ? '/customer/appointments' : null, true);
  const returns = useResource<Row>(allowed && role === 'STORAGE_CUSTOMER' && resource === 'rentals' ? '/customer/returns' : null, true);
  const earlyReturns = useResource<Row>(allowed && role === 'STORAGE_CUSTOMER' && resource === 'rentals' ? '/customer/support-requests' : null, true);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState(''), [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const sources = [contracts, appointments, returns, earlyReturns], sourceIssue = sources.find(item => item.error)?.error;
  const row = data.data, actions = row ? role === 'FACILITY_STAFF' ? staffRecordActions(resource, row, user?.id ?? '', clock) : resource === 'rentals' ? customerRentalActions(row, rows(returns.data?.items), clock, rows(earlyReturns.data?.items)).filter(item => !returns.loading && !returns.error && !earlyReturns.loading && !earlyReturns.error) : [] : [];
  if (role === 'STORAGE_CUSTOMER' && resource === 'contracts' && row && !sources.some(item => item.loading || item.error)) {
    const appointment = customerAppointmentAction(row, rows(contracts.data?.items), rows(appointments.data?.items), clock);
    if (appointment) actions.push(appointment);
    if (row.status === 'ACTIVE') actions.push(customerSupportAction(text(row, 'reservation.id'), { contractId: idOf(row) }));
  }
  if (!config) return <View style={styles.page}><EmptyState title="Không tìm thấy hồ sơ" message="Mở lại danh sách tương ứng." /><Navigation title="Về tổng quan" path={root} /></View>;
  if (role === 'STORAGE_CUSTOMER' && resource === 'reservations' && row) actions.push(customerSupportAction(idOf(row), { operational: false }));
  const refresh = () => { data.refresh(); sources.forEach(item => item.refresh()); };
  return <ScrollView refreshControl={role==='STORAGE_CUSTOMER'&&resource!=='invoices'?<RefreshControl refreshing={data.loading&&Boolean(row)} onRefresh={()=>{if(!action)refresh();}}/>:undefined} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={role==='STORAGE_CUSTOMER'?customerStyles.page:styles.page}>
    <Stack.Screen options={{ title: config.title }} />{role === 'FACILITY_STAFF' ? <><PageHeader eyebrow={config.title} title={row ? codeOf(row) : 'Chi tiết hồ sơ'} description="Đối chiếu thông tin và cập nhật kết quả công việc tại đây."/><Navigation title="Về danh sách" path={`${root}/${resource}`} /><Button title="Làm mới hồ sơ" onPress={refresh} disabled={data.loading || Boolean(action)} /></> : resource==='invoices'?<View style={styles.row}><Button title="Danh sách" variant="secondary" onPress={() => router.push(`${root}/${resource}` as Href)}/><Button title="Cập nhật" variant="secondary" onPress={refresh} disabled={data.loading || Boolean(action)}/></View>:null}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {data.loading ? <LoadingState layout="detail" /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : row && <>
      {role === 'STORAGE_CUSTOMER' && <CustomerRecordSummary resource={resource} row={row}/>}
      {role === 'STORAGE_CUSTOMER' && resource === 'reservations' && row.status === 'CONFIRMED' && Boolean(row.expiresAt) && <WorkflowHint text={paymentWindowClosed({ type: 'INITIAL', reservation: row }, clock) ? 'Đã đến hạn giữ kho. Hãy kiểm tra lại trạng thái; nếu đã chuyển tiền, gửi hỗ trợ để NestBox đối chiếu.' : `Thanh toán trước ${formatDate(String(row.expiresAt), true)} (UTC+7) để giữ kho.`} />}
      {role === 'STORAGE_CUSTOMER' && resource === 'reservations' && row.status === 'CONFIRMED' && <><CustomerReservationDocuments reservation={row}/><Navigation compact title="Hóa đơn của tôi" path="/customer/invoices" /></>}
      {role === 'FACILITY_STAFF' && (resource === 'contracts' || resource === 'renewals' && Boolean(row.appendix)) && <DocumentFile path={`/staff/management/documents/${resource}/${encodeURIComponent(idOf(row))}`} name={codeOf(row)} />}
      {resource === 'contracts' && role === 'FACILITY_STAFF' && <ContractRenewalHistory contract={row} scope="staff/management"/>}
      {resource === 'contracts' && role === 'FACILITY_STAFF' && <ContractTransferHistory contract={row} scope="staff/management"/>}
      {role === 'STORAGE_CUSTOMER' && resource === 'contracts' && <DocumentAcceptance row={row} resource="contracts" onSaved={refresh} />}
      {resource === 'renewals' && <RenewalReview audience="internal" row={row} />}
      {role === 'STORAGE_CUSTOMER' ? <Disclosure title="Hướng dẫn bước tiếp theo"><Text style={[styles.copy, {fontSize: 14, lineHeight: 21}]}>{workflowGuide(resource, row.status, 'customer')}</Text></Disclosure> : <WorkflowHint text={workflowGuide(resource, row.status, 'staff')}/>}
      {(resource === 'returns' || role === 'STORAGE_CUSTOMER' && resource === 'rentals') && text(row, 'returnReadiness.policy') !== 'PERIOD_CLOSEOUT_V1' && <Panel title="Điều kiện công nợ để trả kho"><Text style={styles.copy}>Xem số dư hóa đơn và điều kiện của hồ sơ trả kho. Đề nghị trả trước hạn được quyết toán theo ngày bàn giao.</Text>{Number.isFinite(returnSettlementAmount(row)) ? <Text style={returnSettlementAmount(row) > 0 ? styles.error : styles.success}>{returnSettlementAmount(row) > 0 ? `Còn phải tất toán: ${formatMoney(returnSettlementAmount(row))}. Chưa thể gửi yêu cầu trả kho hoặc hoàn tất nhận trả.` : 'Đã tất toán toàn bộ công nợ hiện có. Tiếp tục đối chiếu điều kiện trả kho và giao nhận hàng.'}</Text> : <Text style={styles.copy}>Chưa có đủ dữ liệu công nợ để xác nhận điều kiện trả kho. Hãy làm mới hồ sơ trước khi tiếp tục.</Text>}{role === 'STORAGE_CUSTOMER' && <Navigation title="Xem hóa đơn" path="/customer/invoices" />}</Panel>}
      {resource === 'returns' && (Number(text(row, 'inventory.remainingItemTypes')) > 0 || Number(text(row, 'inventory.pendingMovements')) > 0) && <Panel title="Lịch sử giao nhận hàng"><Text style={styles.copy}>Sổ giao nhận còn ghi {text(row, 'inventory.remainingItemTypes') || '0'} loại hàng và {text(row, 'inventory.pendingMovements') || '0'} phiếu đang xử lý. Khi trả kho, nhân viên kiểm tra tình trạng thực tế của ô kho.</Text><Navigation title="Xem phiếu nhập – xuất" path={`${root}/stock-movements`} /></Panel>}
      {Boolean(transferProgress(row)) && <Panel title="Tiến độ chuyển kho"><Text style={styles.copy}>{transferProgress(row)}</Text><Text style={styles.copy}>{text(row, 'resolutionNote')}</Text></Panel>}
      {role === 'FACILITY_STAFF' && <Panel title="Thông tin đối chiếu"><Facts values={[
        ['Trạng thái', portalStatus(role, resource, row.status ?? row.rentalState)], ['Khách hàng', text(row, 'customer.fullName', 'reservation.customer.fullName') || ''], ['Yêu cầu đặt kho', text(row, 'reservation.reference', 'reservationReference')], ['Hợp đồng', text(row, 'contractCode', 'contract.contractCode')], ['Kho', text(row, 'unit.unitCode', 'storageUnit.unitCode')], ['Kho nguồn', text(row, 'fromUnit.unitCode')], ['Kho đích', text(row, 'toUnit.unitCode')], ['Lịch hẹn', formatDate(text(row, 'scheduledAt'), true)], ['Nhân viên phụ trách', text(row, 'assignedStaff.fullName')], ['Tiêu đề', row.subject], ['Mô tả', row.description],
        ...rows(row.allocatedUnits).map((item, index) => [`Kho bàn giao ${index + 1}`, `${text(item, 'unitCode')} · ${text(item, 'contractCode')}`] as [string, unknown]),
        ...rows(row.inspections).map((item, index) => [`Kiểm tra ${text(item, 'unit.unitCode') || index + 1}`, label(item.result)] as [string, unknown]),
      ].filter(([, value]) => value && value !== '—') as [string, unknown][]} /></Panel>}
      {sources.some(item => item.loading) && <LoadingState />}{Boolean(sourceIssue) && <ErrorState message={sourceIssue!} onRetry={refresh} />}
      {role === 'STORAGE_CUSTOMER' && resource === 'rentals' && text(row, 'historicalPricing.billingMode') === 'DAILY' && <Text style={styles.copy}>Gia hạn hiện chỉ hỗ trợ kỳ thuê theo tháng. Kho thuê theo ngày vẫn có thể gửi hỗ trợ và trả kho khi hết kỳ.</Text>}
      {role === 'STORAGE_CUSTOMER' && resource === 'rentals' && Boolean(row.pendingRenewal) && <Navigation title="Xem yêu cầu gia hạn đang xử lý" path="/customer/renewals" />}
      {role === 'FACILITY_STAFF' && ['support-requests', 'maintenance'].includes(resource) && text(row, 'assignedStaff.id') !== user?.id && !['COMPLETED', 'RESOLVED'].includes(String(row.status)) && <Text style={styles.copy}>Chỉ nhân viên được phân công mới được xử lý công việc này.</Text>}
      {role === 'FACILITY_STAFF' && resource === 'appointments' && row.status === 'CONFIRMED' && Date.parse(text(row, 'scheduledAt')) > clock && <Text style={styles.copy}>Chưa đến giờ hẹn ({formatDate(text(row, 'scheduledAt'), true)}). Xác nhận sau khi đã giao giấy tờ và chìa khóa.</Text>}
      {role === 'FACILITY_STAFF' && resource === 'appointments' && row.status === 'CONFIRMED' && handoverWindowIssue(row, clock) && <Text style={styles.error}>Ngày hiện tại nằm ngoài thời gian được bàn giao.</Text>}
      {role === 'STORAGE_CUSTOMER' && resource === 'appointments' && <Panel title="Nhân viên phụ trách"><Text style={styles.copy}>{row.assignmentStatus === 'NEEDS_REASSIGNMENT' ? 'Quản lý đang bố trí lại nhân viên.' : text(row, 'assignedStaff.fullName') || 'Đang chờ quản lý phân công nhân viên bàn giao.'}</Text><Text style={styles.copy}>Xác nhận giờ hẹn không đồng nghĩa đã phân công nhân viên.</Text></Panel>}
      {resource === 'appointments' && row.usageStatus === 'WAITING_FOR_RENTAL_START' && <Panel title="Đã bàn giao chìa khóa"><Text style={styles.copy}>Kho sẽ được kích hoạt khi đến ngày bắt đầu thuê và đủ điều kiện.</Text></Panel>}
      {role==='STORAGE_CUSTOMER'&&resource!=='invoices'?<CustomerRecordActions actions={actions} selected={action} onSelect={item=>{setNotice('');setAction(item);}} onClose={()=>setAction(undefined)} onSaved={()=>{setAction(undefined);setNotice('Đã gửi yêu cầu.');refresh();}}/>:action ? <OperationForm key={action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu thành công.'); refresh(); }} /> : actions.map((item, index) => <Button key={item.title} title={item.title} variant={role === 'STORAGE_CUSTOMER' && index > 0 ? 'secondary' : 'primary'} onPress={() => { setNotice(''); setAction(item); }} />)}
      {role === 'STORAGE_CUSTOMER' && resource === 'invoices' && <InvoicePayment key={id} invoice={row} refresh={refresh} onNotice={setNotice} />}
      {resource === 'rentals' && rows(earlyReturns.data?.items).filter(item => isEarlyReturnRequest(item) && text(item, 'reservation.id') === text(row, 'reservationId')).map(item => <Panel key={idOf(item)} title={item.earlyReturnDecision === 'APPROVED' ? 'Đã chấp thuận trả trước hạn' : item.earlyReturnDecision === 'REJECTED' ? 'Chưa chấp thuận trả sớm' : 'Đề nghị đang chờ quản lý'}><Text style={styles.copy}>{text(item, 'description')}</Text><Text style={styles.copy}>{text(item, 'resolutionNote') || 'Quản lý sẽ đối chiếu điều kiện và phản hồi.'}</Text></Panel>)}
      {role==='STORAGE_CUSTOMER'&&resource==='contracts'&&<><Disclosure title="Lịch sử gia hạn"><ContractRenewalHistory contract={row} scope="customer"/></Disclosure><Disclosure title="Lịch sử chuyển kho"><ContractTransferHistory contract={row} scope="customer"/></Disclosure></>}
      {role === 'STORAGE_CUSTOMER' ? resource==='invoices'?<CustomerRecordSections row={row}/>:<CustomerWorkflowDetails resource={resource} row={row}/> : <Disclosure title="Chi tiết và lịch sử hồ sơ"><RecordView row={row} root={root} /></Disclosure>}
    </>}
  </ScrollView>;
}
