import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { DetailSkeleton } from '../../components/LoadingSkeleton';
import { recordIdentity } from '../../utils/record-identity';
import { managerReviewReturn } from '../../components/manager/manager-table-params';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { ManagerPricingExplanation } from '../../components/manager/ManagerPricingExplanation';
import { DocumentFile } from '../../components/customer/DocumentFile';
import { InvoiceBreakdown } from '../../components/customer/InvoiceBreakdown';
import type { CustomerInvoice } from '../../types/customer';
/* oxlint-disable react/jsx-key -- Tuple values below are rendered inside keyed fact fields and table cells, not directly as a child list. */
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';
import { useParams, useSearchParams } from "react-router-dom";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import { hasDraft } from '../../services/live-events';
import {
  at,
  code,
  customer,
  date,
  first,
  label,
  money,
  object,
  rows,
  resources,
  transferHandoverSchedule,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  Facts,
  LoadState,
  PageHeader,
  RefreshStatus,
  Status,
} from "../../components/manager/PortalUi";
import { ManagerActions } from "./ManagerActions";
import { HandoverReportCard } from '../../components/workspace/HandoverReportCard';
import { InventoryEditor } from './InventoryEditor';
import { ManagerContractTransfers } from "./ManagerContractTransfers";
import { useStaffProcessingTarget } from '../staff/useStaffProcessingTarget';
import { StaffActions } from '../staff/StaffActions';
import { isStaffOperationDetail, staffResources, type StaffResource } from '../staff/staff-resources';
import { RenewalReview } from '../../components/manager/RenewalReview';
import { isCustomerTransferSubject, isTransferRequest } from '../../utils/transfer-request';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { CompletedTransferSync, TransferIntake } from '../../components/manager/TransferRequests';
import { canAccessManagerReview } from '../../utils/manager-review-access';
import { StaffReservationDetailPage } from '../staff/StaffReservationDetailPage';
import { StaffAppointmentDetailPage } from '../staff/StaffAppointmentDetailPage';
import { StaffOperationDetails } from '../staff/StaffOperationDetails';
import { staffRecordIdentity } from '../staff/staff-work';

export function ManagerDetailPage({ resource }: { resource: string }) {
  const { user } = useAuth();
  const { id } = useParams();
  if (resource === 'reservations' && user?.role === 'STAFF') return <StaffReservationDetailPage key={id} />;
  if (resource === 'appointments' && user?.role === 'STAFF') return <StaffAppointmentDetailPage key={`${user.id}:${id}`} />;
  return <ManagerOperationalDetail key={`${resource}:${id}`} resource={resource} />;
}

function ManagerOperationalDetail({ resource }: { resource: string }) {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const config = resources[resource];
  const [notice, setNotice] = useState("");
  const [editingUnit, setEditingUnit] = useState(false);
  const data = useApiResource<Row>(
    config && id ? `/manager/${resource}/${encodeURIComponent(id)}` : null,
    user?.id ?? "",
    false,
    true,
  );
  const isStaff = user?.role === 'STAFF';
  const listPath = isStaff ? `/staff/${resource}` : resource === 'reservations' ? '/manager' : ["units", "customers", "inquiries"].includes(
    resource,
  )
    ? `/manager/${resource}`
    : `/manager/operations/${resource}`;
  const [params] = useSearchParams();
  const reviewReturn = user?.role === 'MANAGER' ? managerReviewReturn(params) : null;
  const returnPath = useInternalListReturn(reviewReturn ?? listPath);
  useStaffProcessingTarget(isStaff && Boolean(data.data));
  if (!config) return <Empty title="Không tìm thấy trang" />;
  const row = data.data;
  const staffOperation = isStaff && isStaffOperationDetail(resource) ? resource : null;
  const identity = row && (staffOperation ? staffRecordIdentity(row, resource) : recordIdentity(row, resource));
  const reference = row ? code(row) : '';
  const service = resource === 'support-requests' || resource === 'maintenance';
  const rentalTitle = resource === 'rentals' && identity && [identity.typeName || identity.location || 'Kho đang thuê', identity.person && `Khách ${identity.person}`].filter(Boolean).join(' · ');
  const serviceTitle = service && row && (resource === 'maintenance'
    ? ['Bảo trì kho', identity?.location].filter(Boolean).join(' ')
    : identity?.person ? `Hỗ trợ khách ${identity.person}` : first(row, 'subject') || 'Hỗ trợ khách hàng');
  const staffTitle = isStaff && identity?.person && !identity.title.includes(identity.person) ? `${identity.title === reference ? config.title : identity.title} · ${identity.person}` : '';
  const operationTitle = staffOperation && [
    resource === 'returns' ? 'Trả kho' : config.title,
    resource === 'transfers' && row
      ? [first(row, 'fromUnit.unitCode', 'fromUnit.unitNumber'), first(row, 'toUnit.unitCode', 'toUnit.unitNumber')].filter(Boolean).join(' → ')
      : resource === 'support-requests' ? identity?.person : identity?.location,
  ].filter(Boolean).join(' · ');
  const title = operationTitle || serviceTitle || rentalTitle || staffTitle || (row && (resource === 'customers' ? first(row, 'fullName', 'name') : identity?.title !== reference ? identity?.title : '')) || config.title;
  const status = row?.status ?? row?.rentalState ?? row?.accountStatus;
  const timeline = row ? Object.entries(timelineLabels).flatMap(([key, label]) => {
    if (isStaff && (key === 'updatedAt' || key === 'createdAt' && row.requestedAt)) return [];
    const value = first(row, key);
    const time = Date.parse(value);
    return Number.isFinite(time) ? [{ key, label, value, time }] : [];
  }).sort((left, right) => left.time - right.time) : [];
  const transferSupport = resource === 'support-requests' && isCustomerTransferSubject(row?.subject);
  const hasInlineActions = isStaff && service;
  const staffCanWork = row && first(row, 'assignedStaff.id') === user?.id && (
    resource === 'maintenance' ? ['OPEN', 'IN_PROGRESS'].includes(String(status))
      : resource === 'returns' ? ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(String(status))
      : resource === 'support-requests' && ['ASSIGNED', 'IN_PROGRESS'].includes(String(status)) && !isEarlyReturnRequest(row)
  );
  const canConfirmAppointment = resource !== 'appointments'
    || (row?.status === 'REQUESTED' && first(row, 'assignedStaff.id') === user?.id);
  const showProcessing = !['contracts', 'rentals', 'payments', 'customers', 'units', 'returns'].includes(resource)
    && canAccessManagerReview(user?.role ?? '', resource) && !hasInlineActions && !transferSupport && canConfirmAppointment
    && !(service && ['RESOLVED', 'COMPLETED'].includes(String(status)))
    && (!isStaff || resource !== 'transfers' || row?.status === 'APPROVED')
    && (resource !== 'reservations' || row?.status === 'PENDING');
  return (
    <section className={`record-detail-page${staffOperation ? ' staff-operation-detail' : ''}`}>
      {editingUnit && row && <InventoryEditor kind="unit" record={row} onClose={() => setEditingUnit(false)} onSaved={() => { setEditingUnit(false); setNotice('Đã cập nhật kho.'); data.refresh(); }} />}
      <Link className="booking-back" to={returnPath}>
        <ArrowLeft size={16} />
        {reviewReturn ? 'Về hồ sơ cần xử lý' : returnPath.startsWith('/manager/assignments') ? 'Về phân công' : isStaff ? 'Về danh sách' : resource === 'reservations' ? 'Quay lại' : config.title}
      </Link>
      {!row && !data.loading && (
        <PageHeader title={config.title} />
      )}
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <LoadState
        loading={data.loading}
        error={data.error}
        retry={data.refresh}
        placeholder={<DetailSkeleton form={['appointments', 'support-requests', 'maintenance', 'deposit-settlements', 'returns', 'renewals', 'transfers'].includes(resource)} history={resource === 'deposit-settlements'} />}
      />
      {row && (
        <>
          <PageHeader title={title} status={status ? <Status value={status} text={resource === 'transfers'
            ? status === 'REQUESTED' ? 'Chờ duyệt' : status === 'APPROVED' && row.commercial && !first(row, 'commercial.acceptedAt') ? 'Chờ ký phụ lục' : status === 'APPROVED' && isStaff ? 'Chờ bàn giao' : undefined
            : undefined} /> : undefined}
            meta={resource !== 'customers' && reference ? <CopyRecordCode value={reference} /> : undefined}>
            {resource === 'units' && user?.role === 'MANAGER' && <button className="button-secondary" onClick={() => setEditingUnit(true)}>Sửa thông tin kho</button>}
            <button className="button-secondary" onClick={() => window.print()}>
              <Printer size={16} />
              In hồ sơ
            </button>
            <button
              className="button-secondary"
              aria-label="Làm mới hồ sơ"
              onClick={() => { if (hasDraft()) { setNotice('Bạn đang nhập nội dung. Hãy lưu thao tác hoặc tải lại sau khi đã đối chiếu để tránh mất nội dung.'); return; } data.refresh(); }}
            >
              <RefreshCw size={16} />
            </button>
            <RefreshStatus active={data.refreshing} />
          </PageHeader>
          <div className={`manager-detail-grid${resource === 'transfers' ? ' transfer-detail-grid' : ''}${!showProcessing ? ' record-detail-readonly' : ''}`}>
            {!staffOperation && !service && workflowGuide(resource, row.status) && <div className="workspace-full-row"><WorkflowHint>{workflowGuide(resource, row.status)}</WorkflowHint></div>}
            <div className="manager-detail-content">
              {staffOperation ? <StaffOperationDetails resource={staffOperation} row={row} actions={
                resource === 'support-requests' && isTransferRequest(row)
                  ? null
                  : staffCanWork && <StaffActions key={`${resource}:${id}`} resource={resource as StaffResource} row={row} id={id} refresh={data.refresh} onSuccess={setNotice} />
              } /> : <>
              {resource === 'renewals' && <RenewalReview row={row} />}
              {user?.role !== 'STAFF' && (['contracts', 'invoices'].includes(resource) || resource === 'renewals' && Boolean(row.appendix)) &&
                <DocumentFile path={`/manager/documents/${resource}/${encodeURIComponent(id)}`} name={code(row)} signed={Boolean(first(row, 'terms.acceptedAt', 'appendix.acceptedAt'))} />}
              {service ? <ServiceSummary row={row} maintenance={resource === 'maintenance'} includeAssignee /> : <DetailContent row={row} resource={resource} staff={isStaff} />}
              {user?.role === 'STAFF' && Object.hasOwn(staffResources, resource) && !(resource === 'support-requests' && isTransferRequest(row)) && <StaffActions resource={resource as StaffResource} row={row} id={id} refresh={data.refresh} onSuccess={setNotice} />}
              {resource === "contracts" && (
                <ManagerContractTransfers
                  key={`${user?.id}:${id}:${row.updatedAt ?? ""}`}
                  contract={row}
                  identity={user?.id ?? ""}
                />
              )}
              {user?.role === 'MANAGER' && transferSupport && <TransferIntake row={row} from={reviewReturn ?? ''} />}
              {service && <ServiceOutcome row={row} maintenance={resource === 'maintenance'} />}
              {resource === 'transfers' && !isStaff && <section className="manager-section"><h2>Điều kiện chuyển kho</h2>
                <Facts items={[[ 'Hạn thuê còn lại đến', date(first(row, 'contract.endDate')) ], ['Nhân viên thực hiện', first(row, 'assignedStaff.fullName') || 'Chưa phân công'],
                  ...(row.commercial ? [['Phụ lục đổi loại', first(row, 'commercial.acceptedAt') ? 'Đã ký' : 'Chờ khách ký']] as [string, string][] : [])]} />
                {row.commercialPayment ? <p>{rows(object(row.commercialPayment).dueInvoices).length > 0 ? 'Khách còn hóa đơn đến hạn cần thanh toán trước khi nhân viên nhận việc.'
                  : object(row.commercialPayment).pendingRenewalInvoice ? 'Kỳ gia hạn hiện tại đang chờ phát hành hoặc đối soát hóa đơn.' : 'Không có hóa đơn đến hạn chưa thanh toán.'}</p> : null}
                {first(row, 'requestDescription') && <p>{first(row, 'requestDescription')}</p>}
              </section>}
              {service && <ServiceReferences row={row} staff={isStaff} />}
              </>}
              {staffOperation === 'transfers' && row.status === 'COMPLETED' && <CompletedTransferSync row={row} refresh={data.refresh} />}
              {staffOperation !== 'transfers' && (timeline.length > 0 || operationActors.some(([field]) => first(row, field + '.fullName'))) && <DetailDisclosure title="Lịch sử xử lý">
                {operationActors.some(([field]) => first(row, field + '.fullName')) && <Facts items={operationActors.filter(([field]) => first(row, field + '.fullName')).map(([field, title]) => [field === 'approvedBy' && row.status === 'REJECTED' ? 'Người từ chối' : title, first(row, field + '.fullName')])} />}
                <div className="portal-timeline">
                  {timeline.map(({ key, label, value }) => (
                      <div key={key}>
                        <span>{label}</span>
                        <strong><time dateTime={value}>{date(value, true)}</time></strong>
                      </div>
                    ))}
                </div>
              </DetailDisclosure>}
            </div>
            {showProcessing && <aside className="manager-processing" id={isStaff ? 'staff-processing' : undefined} tabIndex={isStaff ? -1 : undefined}>
              <h2>{staffOperation === 'transfers' ? 'Bàn giao kho chuyển' : resource === 'maintenance' ? 'Nghiệm thu bảo trì' : resource === 'support-requests' ? 'Xem xét yêu cầu hỗ trợ' : 'Xử lý hồ sơ'}</h2>
              <ManagerActions
                key={`${resource}:${id}:${row.updatedAt ?? row.status}`}
                resource={resource}
                row={row}
                id={id}
                refresh={data.refresh}
                onSuccess={setNotice}
              />
            </aside>}
          </div>
        </>
      )}
    </section>
  );
}
const timelineLabels: Record<string, string> = {
  createdAt: "Tạo hồ sơ",
  requestedAt: "Gửi yêu cầu",
  assignedAt: "Phân công nhân viên",
  contactedAt: "Đã liên hệ khách",
  confirmedAt: "Xác nhận",
  cancelledAt: "Đã hủy lịch",
  activatedAt: "Bắt đầu thuê",
  startedAt: "Bắt đầu xử lý",
  workCompletedAt: "Hoàn thành công việc",
  inspectionStartedAt: "Bắt đầu kiểm tra",
  physicallyReturnedAt: "Đã nhận kho",
  reviewedAt: "Đã xem xét",
  approvedAt: "Phê duyệt",
  rejectedAt: "Từ chối",
  verifiedAt: "Nghiệm thu",
  escalatedAt: "Chuyển bộ phận phụ trách",
  resolvedAt: "Giải quyết",
  paidAt: "Thanh toán đủ",
  refundedAt: "Ghi nhận hoàn tiền",
  completedAt: "Hoàn tất",
  settledAt: "Quyết toán",
  updatedAt: "Cập nhật gần nhất",
};

function serviceAssignee(row: Row): [string, React.ReactNode][] {
  const person = customer(row);
  const phone = first(person, 'phone');
  const email = first(person, 'email');
  return [
    ['Phụ trách', first(row, 'assignedStaff.fullName') || 'Chưa phân công'],
    ...(phone || email ? [['Liên hệ', <span key="contact" className="record-links">{phone && <a href={`tel:${phone}`}>{phone}</a>}{email && <a href={`mailto:${email}`}>{email}</a>}</span>]] as [string, React.ReactNode][] : []),
  ];
}

function ServiceSummary({ row, maintenance, includeAssignee }: { row: Row; maintenance: boolean; includeAssignee: boolean }) {
  const unit = object(row.unit ?? row.storageUnit);
  const unitCode = first(unit, 'unitCode', 'unitNumber');
  const location = [unit.floor, unit.zone].filter(Boolean).join(' · ');
  return <section className="manager-section">
    <h2>{maintenance ? 'Nội dung sự cố' : 'Nội dung khách gửi'}</h2>
    <Facts items={[
      ...(unitCode ? [['Kho', [unitCode, location].filter(Boolean).join(' · ')] as [string, string]] : []),
      ...(row.category ? [['Vấn đề', label(row.category)] as [string, string]] : []),
      ...(row.priority ? [['Ưu tiên', label(row.priority)] as [string, string]] : []),
      ...(includeAssignee ? serviceAssignee(row) : []),
    ]} />
    {Boolean(row.subject || row.description) && <div className="record-note">
      {Boolean(row.subject) && <strong>{first(row, 'subject')}</strong>}
      {Boolean(row.description) && <p>{first(row, 'description')}</p>}
    </div>}
  </section>;
}

function ServiceOutcome({ row, maintenance }: { row: Row; maintenance: boolean }) {
  const outcome = first(row, maintenance ? 'workNote' : 'resolutionNote', 'escalationReason');
  const review = first(row, 'verificationNote', 'reviewNote');
  const closedAt = first(row, maintenance ? 'verifiedAt' : 'resolvedAt', maintenance ? 'workCompletedAt' : 'escalatedAt');
  const owner = first(row, maintenance ? 'verifiedBy.fullName' : 'resolvedBy.fullName', 'escalatedBy.fullName', 'assignedStaff.fullName');
  if (!outcome && !review && !closedAt) return null;
  return <section className="manager-section">
    <h2>{maintenance ? 'Kết quả đã ghi nhận' : 'Kết quả xử lý'}</h2>
    {Boolean(row.resolutionType) && <strong>{label(row.resolutionType)}</strong>}
    {outcome && <p className="record-text">{outcome}</p>}
    {review && <p className="record-text"><strong>Nhận xét nghiệm thu</strong> {review}</p>}
    {(owner || closedAt) && <p className="record-attribution">{[owner, closedAt && date(closedAt, true)].filter(Boolean).join(' · ')}</p>}
  </section>;
}

function ServiceReferences({ row, staff }: { row: Row; staff: boolean }) {
  const reservation = first(row, 'reservation.reference');
  const contract = first(row, 'contract.id', 'contract.contractCode');
  const invoice = first(row, 'invoice.id', 'invoice.invoiceCode');
  const unit = first(row, 'unit.id', 'storageUnit.id');
  const maintenance = first(row, 'activeMaintenance.id');
  const source = first(row, 'source');
  const next = first(row, 'nextConfirmedAllocation.reservationReference');
  if (!reservation && !contract && !invoice && !(unit && !staff) && !maintenance && !source && !next) return null;
  return <DetailDisclosure title="Hồ sơ liên quan">
    <Facts items={[
      ...(reservation ? [['Đơn đặt kho', <Link to={`/manager/reservations/${encodeURIComponent(reservation)}`}>{reservation}</Link>]] as [string, React.ReactNode][] : []),
      ...(contract ? [['Hợp đồng', <Link to={`/manager/operations/contracts/${encodeURIComponent(contract)}`}>{first(row, 'contract.contractCode') || 'Xem hợp đồng'}</Link>]] as [string, React.ReactNode][] : []),
      ...(invoice ? [['Hóa đơn', <Link to={`/manager/operations/invoices/${encodeURIComponent(invoice)}`}>{first(row, 'invoice.invoiceCode') || 'Xem hóa đơn'}</Link>]] as [string, React.ReactNode][] : []),
      ...(unit && !staff ? [['Kho vật lý', <Link to={`/manager/units/${encodeURIComponent(unit)}`}>{first(row, 'unit.unitCode', 'storageUnit.unitCode') || 'Xem kho'}</Link>]] as [string, React.ReactNode][] : []),
      ...(maintenance ? [['Bảo trì', <Link to={`/manager/operations/maintenance/${encodeURIComponent(maintenance)}`}>{first(row, 'activeMaintenance.maintenanceCode') || 'Xem bảo trì'}</Link>]] as [string, React.ReactNode][] : []),
      ...(source ? [['Nguồn hồ sơ', label(source)] as [string, string]] : []),
      ...(next ? [['Lịch phân bổ tiếp theo', `${next} · ${date(at(row, 'nextConfirmedAllocation.startDate'))}`] as [string, string]] : []),
    ]} />
  </DetailDisclosure>;
}

function DetailContent({ row, resource, staff }: { row: Row; resource: string; staff: boolean }) {
  const staffBooking = staff && resource === 'reservations';
  const rental = resource === 'rentals';
  const managerContract = !staff && resource === 'contracts';
  const returning = resource === 'returns';
  const inspectionRecords = rows(row.inspections);
  const settlement = object(row.settlement);
  const person = resource === "customers" ? row : customer(row);
  const reservation = object(row.reservation);
  const reference = first(row, "reservation.reference", "reservationReference");
  const invoices = rows(row.invoices ?? at(row, "billingSummary.invoices"));
  const billing = object(row.billingSummary);
  const unit = object(row.storageUnit ?? row.unit);
  const availability = object(row.availability);
  const quote = object(
    row.quote ??
      row.quoteSnapshot ??
      row.reservationPricing ??
      row.historicalPricing,
  );
  return (
    <>
      {returning && <section className="manager-section">
        <h2>Kho trong yêu cầu trả</h2>
        <Facts items={[
          ['Kho', inspectionRecords.map(item => first(item, 'unit.unitCode')).join(', ')],
          ['Hợp đồng', inspectionRecords.map(item => first(item, 'contract.contractCode')).join(', ')],
          ['Hạn thuê', date(at(row, 'reservation.effectiveEndDate'))],
          ['Thời điểm yêu cầu', row.timing === 'EARLY' ? 'Trả trước hạn' : 'Trả từ ngày hết hạn'],
          ['Tiến độ kiểm tra', `${inspectionRecords.filter(item => item.result !== 'PENDING').length}/${inspectionRecords.length} kho`],
          ...(!staff && typeof row.remainingUnitCount === 'number' ? [['Kho tiếp tục thuê', String(row.remainingUnitCount)] as [string, string]] : []),
          ...(!staff && !settlement.id ? [['Tiền cọc theo hóa đơn đã thu', typeof row.recordedDeposit === 'number' ? money(row.recordedDeposit) : 'Cần đối soát'] as [string, string]] : []),
        ]} />
      </section>}
      {returning && !staff && Boolean(settlement.id) && <section className="manager-section">
        <h2>Quyết toán cọc của kho trả</h2>
        <Facts items={[
          ['Trạng thái', <Status value={settlement.status} />],
          ['Tiền cọc', money(settlement.depositAmount)],
          ['Khấu trừ', settlement.status === 'PENDING_REVIEW' ? 'Chờ duyệt' : money(settlement.deductionAmount)],
          ['Tiền hoàn', settlement.status === 'PENDING_REVIEW' ? 'Chờ duyệt' : money(settlement.refundAmount)],
          ['Khoản phải thu thêm', settlement.status === 'PENDING_REVIEW' ? 'Chờ duyệt' : money(settlement.outstandingAmount)],
        ]} />
        <Link className="button-secondary" to={`/manager/operations/deposit-settlements/${encodeURIComponent(String(settlement.id))}`}>Xem hồ sơ hoàn tiền</Link>
      </section>}
      {rental && <section className="manager-section">
        <h2>Kỳ thuê</h2>
        <Facts items={[
          ['Kho', recordIdentity(row, resource).location || first(row, 'storageType.name') || '—'],
          ['Khách hàng', first(person, 'fullName') || '—'],
          ['Bắt đầu', date(row.startDate)], ['Kết thúc', date(row.effectiveEndDate ?? row.endDate)],
        ]} />
      </section>}
      {rental && Object.keys(billing).length > 0 && <section className="manager-section">
        <h2>Hóa đơn và khoản thu</h2>
        <Facts items={[
          ['Đã xuất hóa đơn', money(billing.totalInvoiced)], ['Đã thu', money(billing.totalPaid)],
          ['Công nợ còn lại', money(billing.totalOutstanding)], ['Có thể thanh toán hiện tại', money(billing.payableBalance)],
        ]} />
      </section>}
      {!rental && resource !== "renewals" && first(person, "fullName") && (
        <section className="manager-section">
          <h2>
            {resource === "customers" ? "Thông tin khách hàng" : "Khách hàng"}
          </h2>
          <Facts
            items={[
              ["Họ tên", first(person, "fullName")],
              [
                "Điện thoại",
                person.phone ? (
                  <a href={`tel:${person.phone}`}>{first(person, "phone")}</a>
                ) : (
                  "Chưa cập nhật"
                ),
              ],
              [
                "Email",
                person.email ? (
                  <a href={`mailto:${person.email}`}>
                    {first(person, "email")}
                  </a>
                ) : (
                  "Chưa cập nhật"
                ),
              ],
            ]}
          />
        </section>
      )}
      {!rental && resource !== "renewals" && <section className="manager-section">
        <h2>{staffBooking ? 'Kho và thời gian thuê' : 'Thông tin chính'}</h2>
        <Facts
          items={[
            ...(reference
              ? [
                  [
                    "Đặt kho",
                    <Link
                      to={`/manager/reservations/${encodeURIComponent(reference)}`}
                    >
                      {reference}
                    </Link>,
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(first(
              row,
              "product.name",
              "storageType.name",
              "reservation.storageType.name",
              "unit.storageType.name",
            )
              ? [
                  [
                    "Loại kho",
                    first(
                      row,
                      "product.name",
                      "storageType.name",
                      "reservation.storageType.name",
                      "unit.storageType.name",
                    ),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...((row.quantity ?? reservation.quantity)
              ? [
                  [
                    "Số lượng",
                    `${row.quantity ?? reservation.quantity} kho`,
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(typeof row.adjacencyPreference === "boolean"
              ? ([
                  [
                    "Ưu tiên kho gần nhau",
                    row.adjacencyPreference
                      ? "Có · tùy khả dụng thực tế"
                      : "Không yêu cầu",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.source
              ? ([["Nguồn hồ sơ", label(row.source)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(row.processedBy
              ? ([["Người xử lý", first(row, "processedBy.fullName")]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(row.resolutionType
              ? ([["Kết quả hỗ trợ", label(row.resolutionType)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...((row.startDate ?? reservation.startDate)
              ? [
                  [
                    "Ngày bắt đầu",
                    date(row.startDate ?? reservation.startDate),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...((row.endDateExclusive ??
            row.endDate ??
            row.effectiveEndDate ??
            reservation.endDate)
              ? [
                  [
                    "Ngày kết thúc",
                    date(
                      row.effectiveEndDate ??
                        row.endDateExclusive ??
                        row.endDate ??
                        reservation.endDate,
                    ),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(row.previousEndDate
              ? ([
                  ["Hạn hiện tại", date(row.previousEndDate)],
                  ["Gia hạn đến", date(row.requestedEndDate)],
                  ["Phương thức", label(row.paymentPlan)],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.scheduledAt
              ? ([["Lịch hẹn", date(row.scheduledAt, true)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(resource === 'appointments' ? [
              ['Nhân viên được phân công', first(row, 'assignedStaff.fullName') || (row.status === 'COMPLETED' ? 'Lịch cũ chưa lưu phân công' : 'Chưa được quản lý phân công')],
            ] as Array<[string, React.ReactNode]> : []),
            ...(row.priority
              ? ([
                  ["Ưu tiên", label(row.priority)],
                  ["Hạng mục", label(row.category)],
                  [
                    "Nhân viên phụ trách",
                    first(row, "assignedStaff.fullName") || "Chưa phân công",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.reason
              ? ([["Lý do", label(row.reason)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),

            ...(resource === "customers"
              ? ([
                  ["Lượt đặt kho", first(row, "reservationCount")],
                  ["Trạng thái tài khoản", label(row.accountStatus)],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(resource === "units"
              ? ([
                  ["Kích thước", first(row, "dimensions.display")],
                  ["Điều kiện", label(row.condition)],
                  [
                    "Vị trí",
                    [
                      row.floor,
                      row.zone && `Khu ${row.zone}`,
                      row.row && `Hàng ${row.row}`,
                      row.position && `Ô ${row.position}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Chưa cập nhật",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
          ]}
        />
        {[
          "subject",
          "description",
          "customerNotes",
          "note",
          "handoverNote",
          "workNote",
          "verificationNote",
          "escalationReason",
          "resolutionNote",
          "rejectionReason",
          "reviewNote",
        ]
          .filter((key) => row[key] && !(resource === 'appointments' && key === 'handoverNote'))
          .map((key) => (
            <div className="portal-note" key={key}>
              <small>{noteLabels[key]}</small>
              <p>{first(row, key)}</p>
            </div>
          ))}
      </section>}
      {resource === 'appointments' && <HandoverReportCard appointment={row} />}
      {Object.keys(availability).length > 0 && (
        <section className="manager-section">
          <h2>Khả dụng tại lần kiểm tra gần nhất</h2>
          <p>{first(availability, "message")}</p>
          <Facts
            items={[
              [
                "Kết quả",
                availability.available === true
                  ? "Đủ kho theo kỳ thuê"
                  : "Cần xác nhận lại",
              ],
              [
                "Kỳ đã kiểm tra",
                `${date(availability.startDate)} → ${date(availability.endDateExclusive)}`,
              ],
            ]}
          />
          <small>
            Kết quả đã lưu theo hồ sơ. Khi duyệt, hệ thống kiểm tra lại toàn bộ
            kỳ thuê.
          </small>
        </section>
      )}
      {row.isOverdue === true && (
        <div className="booking-alert is-error">
          Đã quá hạn thuê. Kho vẫn đang sử dụng cho đến khi hoàn tất trả kho và
          kiểm tra.
        </div>
      )}
      {(at(row, "futureAllocationRisk.hasCurrentAllocationConflict") === true ||
        row.hasFutureAllocation === true) && (
        <div className="booking-alert">
          Kho có lịch phân bổ khác cần theo dõi.
          {first(row, "nextConfirmedAllocation.reservationReference") && (
            <p>
              {first(row, "nextConfirmedAllocation.reservationReference")} ·{" "}
              {date(at(row, "nextConfirmedAllocation.startDate"))}
            </p>
          )}
        </div>
      )}
      {Object.keys(unit).length > 0 && (
        <section className="manager-section">
          <h2>Thông tin kho</h2>
          <Facts
            items={[
              [
                "Mã kho",
                <Link
                  to={`/manager/units/${encodeURIComponent(first(unit, "id", "unitCode"))}`}
                >
                  {first(unit, "unitCode")}
                </Link>,
              ],
              [
                "Tình trạng",
                <Status value={unit.status ?? unit.physicalStatus} />,
              ],
              [
                "Vị trí",
                [unit.floor, unit.zone].filter(Boolean).join(" · ") ||
                  "Chưa cập nhật",
              ],
            ]}
          />
        </section>
      )}
      {row.fromUnit && (
        <section className="manager-section">
          <h2>Điều chuyển</h2>
          <Facts
            items={[
              [
                "Kho nguồn",
                <Link
                  to={`/manager/units/${encodeURIComponent(first(row, "fromUnit.id"))}`}
                >
                  {first(row, "fromUnit.unitCode")}
                </Link>,
              ],
              [
                "Kho đích",
                row.toUnit ? (
                  <Link
                    to={`/manager/units/${encodeURIComponent(first(row, "toUnit.id"))}`}
                  >
                    {first(row, "toUnit.unitCode")}
                  </Link>
                ) : (
                  "Chưa chọn"
                ),
              ],
              [
                "Hợp đồng",
                <Link
                  to={`/manager/operations/contracts/${encodeURIComponent(first(row, "contract.id"))}`}
                >
                  {first(row, "contract.contractCode")}
                </Link>,
              ],
              ...(resource === 'transfers' ? [['Lịch bàn giao khách đề xuất', transferHandoverSchedule(row)] as [string, string]] : []),
            ]}
          />
        </section>
      )}
      {!row.fromUnit &&
        (row.contract || row.invoice || row.activeMaintenance) && (
          <section className="manager-section">
            <h2>Hồ sơ liên quan</h2>
            <div className="portal-actions">
              {Boolean(row.contract) && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/contracts/${encodeURIComponent(first(row, "contract.id", "contract.contractCode"))}`}
                >
                  Hợp đồng · {first(row, "contract.contractCode")}
                </Link>
              )}
              {Boolean(row.invoice) && resource !== "payments" && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/invoices/${encodeURIComponent(first(row, "invoice.id", "invoice.invoiceCode"))}`}
                >
                  Hóa đơn · {first(row, "invoice.invoiceCode")}
                </Link>
              )}
              {Boolean(row.activeMaintenance) && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/maintenance/${encodeURIComponent(first(row, "activeMaintenance.id"))}`}
                >
                  Bảo trì · {first(row, "activeMaintenance.maintenanceCode")}
                </Link>
              )}
            </div>
          </section>
        )}
      {resource === "invoices" && (
        <section className="manager-section">
          <h2>Chi tiết hóa đơn</h2>
          <p>Đơn {first(row, 'reservation.reference')} · {(row.breakdown as CustomerInvoice['breakdown'])?.units?.length ?? first(row, 'reservation.quantity')} kho</p>
          <InvoiceBreakdown details={row.breakdown as CustomerInvoice['breakdown']} currency={first(row, 'currency')} />
          {first(row, 'replacesInvoice.id') && <p>Thay hóa đơn <Link to={`/manager/operations/invoices/${encodeURIComponent(first(row, 'replacesInvoice.id'))}`}>{first(row, 'replacesInvoice.invoiceCode')}</Link></p>}
          {first(row, 'replacementInvoice.id') && <p>Được thay bằng <Link to={`/manager/operations/invoices/${encodeURIComponent(first(row, 'replacementInvoice.id'))}`}>{first(row, 'replacementInvoice.invoiceCode')}</Link></p>}
          <h3>{staff ? 'Tổng thanh toán' : 'Số tiền và kỳ thanh toán'}</h3>
          <Facts
            items={[
              ["Loại hóa đơn", label(row.type)],
              [
                "Kỳ thu",
                `${date(row.billingPeriodStart)} → ${date(row.billingPeriodEnd)}`,
              ],
              ["Hạn thanh toán", first(row, "type") === "INITIAL" && first(row, "reservation.expiresAt") ? date(first(row, "reservation.expiresAt"), true) : date(row.dueAt)],
              ["Tiền thuê", money(row.rentalAmount)],
              ["Tiền cọc", money(row.depositAmount)],
              ["Dịch vụ bổ sung", money(row.serviceAmount)],
              ["Phí được duyệt", money(row.chargeAmount)],
              ["Tổng riêng hóa đơn này", money(row.totalAmount)],
              ["Đã thu", money(row.amountPaid)],
              ["Còn phải thanh toán hóa đơn này", money(row.balanceDue)],
            ]}
          />
          {row.isPastDue === true && (
            <div className="booking-alert is-error">
              Hóa đơn đã quá hạn thanh toán.
            </div>
          )}
        </section>
      )}
      {resource === "payments" && (
        <section className="manager-section">
          <h2>Khoản thu đã ghi nhận</h2>
          <Facts
            items={[
              ["Số tiền", money(row.amount)],
              ["Phương thức", label(row.method)],
              ["Mã tham chiếu", first(row, "reference") || "—"],
              ["Người ghi nhận", first(row, "recordedBy.fullName")],
              ["Ngày nhận", date(row.receivedAt, true)],
              [
                "Hóa đơn",
                <Link
                  to={`/manager/operations/invoices/${encodeURIComponent(first(row, "invoice.id"))}`}
                >
                  {first(row, "invoice.invoiceCode")}
                </Link>,
              ],
            ]}
          />
        </section>
      )}
      {resource === "deposit-settlements" && (
        <section className="manager-section">
          <h2>Hoàn tiền cọc</h2>
          <Facts
            items={[
              ["Tiền cọc", money(row.depositAmount)],
              ["Tổng phí được duyệt", money(row.totalApprovedCharges)],
              ["Khấu trừ cọc", money(row.deductionAmount)],
              ["Tiền cọc hoàn lại", money(row.refundAmount)],
              ["Thu thêm", money(row.outstandingAmount)],
              ["Phương thức hoàn", label(row.refundMethod)],
              ...(first(row, "refundReference") ? [["Tham chiếu hoàn", first(row, "refundReference")] as [string, string]] : []),
            ]}
          />
          {Boolean(row.outstandingInvoice) && (
            <Link
              className="button-secondary"
              to={`/manager/operations/invoices/${encodeURIComponent(first(row, "outstandingInvoice.id"))}`}
            >
              Thu hóa đơn bổ sung ·{" "}
              {first(row, "outstandingInvoice.invoiceCode")}
            </Link>
          )}
        </section>
      )}
      {Object.keys(quote).length > 0 && resource !== "renewals" && <ManagerPricingExplanation quote={quote} emphasizeInstallments={managerContract} />}
      {managerContract && reference && !invoices.length && <DetailDisclosure title="Hóa đơn theo kỳ">
        <Link to={`/manager/operations/invoices?${new URLSearchParams({ search: reference })}`}>Xem hóa đơn của đơn {reference}</Link>
      </DetailDisclosure>}
      <RelatedTable
        title="Kho được phân bổ"
        items={rows(row.allocatedUnits)}
        headers={["Kho", "Vị trí / Kỳ phân bổ", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/units/${encodeURIComponent(first(item, "unitId", "unitNumber", "unitCode"))}`}
          >
            {first(item, "unitNumber", "unitCode")}
          </Link>,
          <>
            {[
              first(item, "floor"),
              first(item, "zone"),
              first(item, "row"),
              first(item, "position"),
            ]
              .filter(Boolean)
              .join(" · ")}
            <small>
              {date(item.plannedStartDate)} → {date(item.plannedEndDate)}
              {item.releasedAt ? ` · Đã trả ${date(item.releasedAt)}` : ""}
            </small>
          </>,
          <Status value={item.unitStatus ?? item.physicalStatus} />,
        ]}
      />
      <RelatedTable
        title="Hợp đồng liên quan"
        items={rows(row.contracts)}
        compact={rental}
        headers={["Hợp đồng", "Kho", "Trạng thái"]}
        render={(item) => [
          item.id || item.contractCode ? (
            <Link
              to={`/manager/operations/contracts/${encodeURIComponent(first(item, "id", "contractCode"))}`}
            >
              {first(item, "contractCode")}
            </Link>
          ) : (
            first(item, "contractCode")
          ),
          first(item, "unit.unitCode", "storageUnit.unitCode", "unitCode"),
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title="Hóa đơn liên quan"
        items={invoices}
        compact={rental}
        collapsible={managerContract}
        headers={managerContract ? ["Hóa đơn", "Kỳ thu", "Tổng / Còn thu", "Trạng thái"] : ["Hóa đơn", "Tổng / Còn thu", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/operations/invoices/${encodeURIComponent(first(item, "id", "invoiceCode"))}`}
          >
            {rental ? <>{label(item.type)}{item.billingCycle != null ? ` · Kỳ ${item.billingCycle}` : ''}<small>{first(item, 'invoiceCode')}</small></> : first(item, "invoiceCode")}
          </Link>,
          ...(managerContract ? [item.billingPeriodStart && item.billingPeriodEnd
            ? `${date(item.billingPeriodStart)} → ${date(item.billingPeriodEnd)}` : '—'] : []),
          <>
            {money(item.totalAmount)}
            <small>Còn: {money(item.balanceDue)}</small>
          </>,
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title={!staff ? "Khoản thu đã ghi nhận" : "Lịch sử thanh toán"}
        items={rows(row.payments)}
        collapsible={!staff}
        headers={["Khoản thu", "Số tiền", "Tiếp nhận"]}
        render={(item) => [
          <Link
            to={`/manager/operations/payments/${encodeURIComponent(first(item, "id", "paymentCode"))}`}
          >
            {first(item, "paymentCode")}
          </Link>,
          <>
            {money(item.amount)}
            <small>{label(item.method)}</small>
          </>,
          <>
            {first(item, "recordedBy.fullName")}
            <small>{date(item.receivedAt, true)}</small>
          </>,
        ]}
      />
      <RelatedTable
        title="Kết quả kiểm tra"
        items={rows(row.inspections ?? row.physicalInspections)}
        headers={["Kho / Hợp đồng", "Kết quả", "Ghi nhận"]}
        render={(item) => [
          <>
            {first(item, "unit.unitCode")}
            <small>{first(item, "contract.contractCode")}</small>
            {returning && <small>Hạn thuê {date(at(item, 'contract.endDate'))}</small>}
          </>,
          <>
            <Status value={item.result} />
            <small>{item.issueType ? label(item.issueType) : ""}</small>
          </>,
          <>
            {first(item, "conditionNote")}
            <small>{first(item, "issueNote")}</small>
            {first(item, "inspectedBy.fullName") && (
              <small>Kiểm tra: {first(item, "inspectedBy.fullName")}</small>
            )}
            {item.inspectedAt ? (
              <small>{date(item.inspectedAt, true)}</small>
            ) : null}
          </>,
        ]}
      />
      <RelatedTable
        title="Phí đã được duyệt"
        items={rows(row.issues)}
        headers={["Kho", "Phân loại", "Phí / Lý do"]}
        render={(item) => [
          first(item, "unit.unitCode"),
          label(item.approvedIssueType),
          <>
            {money(item.approvedChargeAmount)}
            <small>{first(item, "reason")}</small>
          </>,
        ]}
      />
      <RelatedTable
        title="Lịch sử đặt kho"
        items={rows(row.reservations)}
        headers={["Đặt kho", "Kỳ thuê", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/reservations/${encodeURIComponent(first(item, "id"))}`}
          >
            {first(item, "reference")}
            <small>
              {first(item, "storageType.name")} · {first(item, "quantity")} kho
            </small>
          </Link>,
          `${date(item.startDate)} → ${date(item.endDate)}`,
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title="Lịch phân bổ & lịch sử"
        items={rows(row.allocations)}
        headers={["Đặt kho", "Kỳ thuê", "Khách hàng"]}
        render={(item) => [
          <Link
            to={`/manager/reservations/${encodeURIComponent(first(item, "reservationReference"))}`}
          >
            {first(item, "reservationReference")}
          </Link>,
          <>
            {date(item.startDate)} → {date(item.endDate)}
            <small>
              {item.releasedAt
                ? `Đã trả: ${date(item.releasedAt)}`
                : "Chưa giải phóng phân bổ"}
            </small>
          </>,
          first(item, "customer.fullName"),
        ]}
      />
      {resource === "units" &&
        row.status === "OCCUPIED" &&
        !row.currentAllocation && (
          <div className="booking-alert">
            Kho vẫn đang sử dụng. Hồ sơ phân bổ có thể đã hết kỳ thuê; cần kiểm
            tra kho đang thuê và quá hạn trước khi xử lý.
          </div>
        )}
    </>
  );
}
const noteLabels: Record<string, string> = {
  subject: "Tiêu đề",
  description: "Mô tả",
  customerNotes: "Ghi chú khách hàng",
  note: "Ghi chú",
  handoverNote: "Biên bản bàn giao",
  workNote: "Kết quả công việc",
  verificationNote: "Nhận xét sau kiểm tra",
  escalationReason: "Lý do chuyển bộ phận phụ trách",
  resolutionNote: "Kết quả xử lý",
  rejectionReason: "Lý do từ chối",
  reviewNote: "Ghi chú duyệt",
};
const operationActors: Array<[string, string]> = [
  ["requestedBy", "Người gửi yêu cầu"],
  ["reportedBy", "Người báo sự cố"],
  ["assignedBy", "Người phân công"],
  ["confirmedBy", "Người xác nhận lịch"],
  ["completedBy", "Người hoàn tất"],
  ["inspectionStartedBy", "Người bắt đầu kiểm tra"],
  ["physicallyReturnedBy", "Người nhận kho trả"],
  ["approvedBy", "Người phê duyệt"],
  ["reviewedBy", "Người duyệt hồ sơ"],
  ["verifiedBy", "Người kiểm tra kết quả"],
  ["escalatedBy", "Nhân viên chuyển quản lý"],
  ["resolvedBy", "Người giải quyết"],
  ["settledBy", "Người hoàn tất quyết toán"],
];
function RelatedTable({
  title,
  items,
  headers,
  render,
  compact = false,
  collapsible = false,
}: {
  title: string;
  items: Row[];
  headers: string[];
  render: (item: Row) => React.ReactNode[];
  compact?: boolean;
  collapsible?: boolean;
}) {
  if (!items.length) return null;
  if (compact) return <DetailDisclosure title={`${title} (${items.length})`} open>
    <ul className="record-related-list">
      {items.map((item, index) => <li key={first(item, 'id', 'contractCode', 'invoiceCode') || index}>
        {render(item).map((cell, column) => <div key={headers[column]}>{cell}</div>)}
      </li>)}
    </ul>
  </DetailDisclosure>;
  const table = (
      <div className="manager-table-wrap">
        <table className="manager-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={
                  first(
                    item,
                    "id",
                    "contractCode",
                    "invoiceCode",
                    "unitCode",
                    "unitNumber",
                  ) || index
                }
              >
                {render(item).map((value, i) => (
                  <td key={headers[i]}>{value || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
  return collapsible ? <DetailDisclosure title={`${title} (${items.length})`}>{table}</DetailDisclosure>
    : <section className="manager-section"><h2>{title}</h2>{table}</section>;
}
