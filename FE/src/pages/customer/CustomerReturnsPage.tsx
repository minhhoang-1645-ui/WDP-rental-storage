import { DetailCard } from '../../components/workspace/DetailRow';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { EntitySelect } from '../../components/EntitySelect';
import { useListPagination } from "../../components/workspace/useListPagination";
import { CustomerFormSources } from "../../components/customer/CustomerFormSources";
import { mutate } from "../../services/portal";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import {
  ClipboardCheck,
  RefreshCw,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
import { Link, useSearchParams } from 'react-router-dom';
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import {
  formatPortalDate,
  moneyLabel,
} from "../../components/customer/CustomerPortalHelpers";
import {
  CustomerStatus,
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
} from "../../components/customer/CustomerPortalUi";
import { ApiError } from "../../services/api";
import { EarlyReturnPanel } from '../../components/customer/EarlyReturnPanel';
import { Modal } from '../../components/manager/PortalUi';
import { useScopedSelection } from '../../components/customer/useScopedSelection';
import { earlyReturnAppliesTo, isCurrentEarlyReturnApproval } from '../../utils/early-return';
import { vietnamCalendarDate } from '../../utils/business-date';
import { ReturnInventoryNotice } from '../../components/customer/ReturnInventoryNotice';
import type {
  CustomerDepositSettlement,
  CustomerRental,
  CustomerReturnRequest,
  CustomerSupportRequest,
} from "../../types/customer";

export function CustomerReturnsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const returnPath = useInternalListReturn('/customer/returns');
  const returnFilter = params.get('return');
  const settlementFilter = params.get('settlement');
  const rentals = usePaginatedResource<CustomerRental>(
    "/customer/rentals?limit=100",
    user?.id ?? "",
    true,
  );
  const returns = usePaginatedResource<CustomerReturnRequest>(
    "/customer/returns?limit=100",
    user?.id ?? "",
    true,
  );
  const settlements = usePaginatedResource<CustomerDepositSettlement>(
    "/customer/deposit-settlements?limit=100",
    user?.id ?? "",
    true,
  );
  const [section, setView] = useState<"returns" | "settlements">("returns");
  const view = settlementFilter ? 'settlements' : returnFilter ? 'returns' : section;
  const approvals = usePaginatedResource<CustomerSupportRequest>('/customer/support-requests?limit=100', user?.id ?? '', true);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setCheckedAt(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submitLock = useRef(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const activeReturnIds = new Set(
    (returns.data?.items ?? [])
      .filter((item) => item.status !== "COMPLETED")
      .flatMap(item => item.inspections.map(inspection => inspection.contract.id)),
  );
  const today = vietnamCalendarDate(checkedAt);
  const available = (rentals.data?.items ?? []).flatMap(rental => rental.pendingRenewal ? [] : rental.contracts
    .filter(contract => contract.unit.status === 'OCCUPIED' && !contract.pendingRenewal && !contract.returnInProgress && !activeReturnIds.has(contract.id))
    .filter(contract => contract.endDate <= today || approvals.data?.items.some(request =>
      earlyReturnAppliesTo(request, rental.reservationId, contract.id) && isCurrentEarlyReturnApproval(request, contract.endDate)))
    .map(contract => ({ contract, rental })));
  const current = view === "returns" ? returns : settlements;
  const [contractId, setContractId] = useScopedSelection('contract', available.map(({ contract }) => ({ value: contract.id, aliases: [contract.contractCode] })));
  const selected = available.find(item => item.contract.id === contractId);
  const selectedDebt = selected?.contract.returnReadiness?.totalOutstanding ?? null;
  const canSubmitReturn = selected?.contract.returnReadiness?.canReturn === true;
  const earlyCloseout = selected?.contract.returnReadiness?.policy === 'PERIOD_CLOSEOUT_V1';
  const otherUnits = selected?.rental.contracts.filter(contract => contract.id !== contractId).map(contract => contract.unit.unitCode) ?? [];
  const refresh = () => {
    setCheckedAt(Date.now());
    returns.refresh();
    settlements.refresh();
    rentals.refresh();
    approvals.refresh();
  };

  const openConfirmation = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmitReturn) setConfirming(true);
  };

  const submit = async () => {
    if (submitLock.current || !selected || !canSubmitReturn) return;
    submitLock.current = true;
    setConfirming(false);
    setMessage(null);
    setSubmitting(true);
    try {
      await mutate<CustomerReturnRequest>(
        "/customer/returns",
        "POST",
        { reservationId: selected.rental.reservationId, rentalContractId: selected.contract.id, note: note.trim() || undefined },
        true,
      );
      setMessage({ kind: "ok", text: "Đã gửi yêu cầu trả kho." });
      setContractId("");
      setNote("");
      returns.refresh();
      rentals.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Không thể gửi yêu cầu trả kho.",
      });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className={returnFilter || settlementFilter ? "customer-page record-detail-page" : "customer-page"}>
      <PortalPageHeader
        eyebrow="Kết thúc thuê"
        title="Trả kho và quyết toán tiền cọc"
        description="Gửi yêu cầu trả kho, theo dõi kiểm tra và quyết toán tiền cọc."
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={refresh}
            disabled={current.loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      {!returnFilter && !settlementFilter && <ReturnInventoryNotice />}
      <div className={returnFilter || settlementFilter ? "record-focused-layout" : "customer-module-layout"}>
        <section className="customer-panel">
          {returnFilter || settlementFilter ? <p className="customer-filter-notice"><Link to={returnPath}>Xem tất cả hồ sơ trả kho</Link></p> :
          <div className="customer-module-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === "returns"}
              className={view === "returns" ? "is-active" : ""}
              onClick={() => setView("returns")}
            >
              <RotateCcw size={17} /> Trả kho ({returns.data?.total ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "settlements"}
              className={view === "settlements" ? "is-active" : ""}
              onClick={() => setView("settlements")}
            >
              <WalletCards size={17} /> Tiền cọc ({settlements.data?.total ?? 0}
              )
            </button>
          </div>}
          {[returns.status, settlements.status, rentals.status].includes(
            401,
          ) ? (
            <CustomerSessionExpired />
          ) : current.loading ? (
            <PortalLoading label="Đang tải dữ liệu trả kho…" />
          ) : current.error ? (
            <PortalError message={current.error} onRetry={refresh} />
          ) : view === "returns" ? (
            <ReturnList focused={Boolean(returnFilter)} items={(returns.data?.items ?? []).filter(item => !returnFilter || item.id === returnFilter)} />
          ) : (
            <SettlementList focused={Boolean(settlementFilter)} items={(settlements.data?.items ?? []).filter(item => !settlementFilter || item.id === settlementFilter)} />
          )}
        </section>
        {!returnFilter && !settlementFilter && <div className="customer-return-forms"><form id="return-request-form" className="customer-panel customer-module-form" onSubmit={openConfirmation}>
          <CustomerFormSources resources={[rentals, returns, approvals]} retry={refresh} />
          <fieldset
            disabled={
              submitting ||
              [rentals, returns, approvals].some(
                (resource) => resource.loading || resource.error,
              )
            }
          >
            <h2>Gửi yêu cầu trả kho</h2>
            <p>Chọn kho đã đến hạn hoặc được quản lý chấp thuận trả sớm.</p>
            <label className="field-label">
              Kho muốn trả
              <EntitySelect
                aria-label="Kho muốn trả"
                required
                value={contractId}
                onValueChange={setContractId}
              >
                <option value="">Chọn kho muốn trả</option>
                {available.map(({ rental, contract }) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.unit.unitCode} · {contract.unit.storageType?.name ?? rental.storageType.name} · Hạn {formatPortalDate(contract.endDate)}
                  </option>
                ))}
              </EntitySelect>
            </label>
            {selected && <div className={`return-payment-state ${canSubmitReturn ? 'is-settled' : ''}`} role="region" aria-label="Thanh toán của kho muốn trả">
              {typeof selected.contract.returnNoticeDays === 'number' && <p>{selected.contract.returnNoticeDays > 0
                ? 'Nên báo trước ' + selected.contract.returnNoticeDays + ' ngày để cơ sở bố trí lịch trả. Báo muộn không phát sinh phí khi trả đúng hạn.'
                : 'Điều khoản của kho này không yêu cầu báo trước.'}</p>}
              {selected.contract.overdueOccupancy && selected.contract.overdueOccupancy.days > 0 && <p>Đã quá hạn trả {selected.contract.overdueOccupancy.days} ngày.
                {selected.contract.overdueOccupancy.withinGrace ? ' Đang trong thời gian ân hạn.' : ' Khoản quá hạn được xác định khi quyết toán.'}</p>}
              <strong>{canSubmitReturn ? 'Có thể gửi yêu cầu trả kho' : earlyCloseout ? 'Cần kiểm tra điều kiện bàn giao' : selected.contract.returnReadiness?.awaitingRenewalInvoices ? 'Đang chờ hóa đơn gia hạn' : selectedDebt === null || selectedDebt === 0 ? 'Cần đối soát trước khi trả kho' : 'Cần thanh toán trước khi trả kho'}</strong>
              <p>{earlyCloseout ? (canSubmitReturn ? 'Tiền thuê được tính đến ngày nhân viên nhận lại kho. Tiền cọc được xử lý riêng.' : 'Hãy liên hệ NestBox để kiểm tra tiền cọc và các yêu cầu đang xử lý.') : canSubmitReturn ? 'Nhân viên sẽ kiểm tra kho. Tiền cọc được quyết toán sau khi nhận kho.' : selected.contract.returnReadiness?.awaitingRenewalInvoices ? 'Làm mới để kiểm tra các kỳ gia hạn đã phát hành.' : selectedDebt === null || selectedDebt === 0 ? 'Hãy liên hệ NestBox để đối chiếu hóa đơn và tiền cọc của hợp đồng này.' : <>Số dư các hóa đơn liên quan, gồm cả hóa đơn chung nếu có: <strong>{moneyLabel(selectedDebt)}</strong>.</>}</p>
              {!canSubmitReturn && !earlyCloseout && selectedDebt !== null && selectedDebt > 0 && <Link className="button-primary" to={`/customer/payments?reservation=${encodeURIComponent(selected.rental.reservationId)}`}>Thanh toán các hóa đơn</Link>}
            </div>}
            <label className="field-label">
              Ghi chú
              <textarea
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: đã dọn hết đồ và sẵn sàng kiểm tra"
              />
            </label>
            {message && (
              <p
                className={`customer-form-message is-${message.kind}`}
                role="status"
              >
                {message.text}
              </p>
            )}
            <button
              className="button-primary"
              type="submit"
              disabled={submitting || !canSubmitReturn}
            >
              <RotateCcw size={17} />{" "}
              {submitting ? "Đang gửi…" : "Tiếp tục"}
            </button>
            {!rentals.loading && available.length === 0 && (
              <small>
                Chưa có kho đến hạn hoặc được chấp thuận trả sớm. Bạn có thể gửi đề nghị trả trước hạn bên dưới.
              </small>
            )}
          </fieldset>
        </form><EarlyReturnPanel checkedAt={checkedAt} rentals={rentals.data?.items ?? []} activeReturnIds={activeReturnIds} requests={approvals} /></div>}
      </div>
      {confirming && selected && <Modal title="Xác nhận trả kho" onClose={() => setConfirming(false)} footer={<>
        <button type="button" className="button-secondary" onClick={() => setConfirming(false)}>Quay lại</button>
        <button type="button" className="button-primary" disabled={!canSubmitReturn || submitting} onClick={() => void submit()}>Gửi yêu cầu trả kho</button>
      </>}>
        <dl className="customer-record-facts">
          <div><dt>Kho trả</dt><dd>{selected.contract.unit.unitCode}</dd></div>
          <div><dt>Hợp đồng</dt><dd>{selected.contract.contractCode}</dd></div>
          {otherUnits.length > 0 && <div><dt>Kho tiếp tục thuê</dt><dd>{otherUnits.join(', ')}</dd></div>}
        </dl>
        {selected.contract.endDate > today && <p>Quản lý đã chấp thuận trả trước hạn cho kho này.</p>}
      </Modal>}
    </section>
  );
}

function ReturnList({ items, focused }: { items: CustomerReturnRequest[]; focused: boolean }) {
  const { items: visible, pagination } = useListPagination(items);
  if (!items.length)
    return (
      <PortalEmpty
        icon={<RotateCcw size={30} />}
        title="Chưa có yêu cầu trả kho"
      >
        <span>
          Các yêu cầu trả kho và tiến độ kiểm tra sẽ xuất hiện tại đây.
        </span>
      </PortalEmpty>
    );
  return (
    <>
      <div className="customer-card-list">
        {visible.map((item) => (
          <DetailCard
                    detail={!focused ? { to: '/customer/returns' + '?' + new URLSearchParams({ return: item.id }), label: `Xem yêu cầu trả kho ${item.returnCode}` } : undefined}
            className="customer-record-card customer-record-card--compact"
            key={item.id}
          >
            <div className="customer-record-heading">
              <div>
                <CopyRecordCode value={item.returnCode} />
                <h2>{item.inspections.map(inspection => inspection.unit.unitCode).join(', ') || item.reservation.storageType.name}</h2>
              </div>
              <CustomerStatus status={item.status} />
            </div>
            <p>
              {item.reservation.reference} · yêu cầu ngày{" "}
              {formatPortalDate(item.requestedAt, true)}
            </p>
            {item.returnReadiness && !item.physicallyReturnedAt && !item.returnReadiness.canReturn && <div className="customer-inline-notice">
              <strong>Cần thanh toán đủ trước khi trả kho</strong>
              <p>{item.returnReadiness.totalOutstanding === null ? 'Chưa xác định được số tiền còn thiếu. Hãy làm mới hoặc liên hệ nhân viên.' : <>Còn phải thanh toán: {moneyLabel(item.returnReadiness.totalOutstanding)}.</>}</p>
              <Link to={`/customer/payments?reservation=${encodeURIComponent(item.reservation.id)}`}>Xem hóa đơn và thanh toán</Link>
            </div>}
            {item.earlyReturnCloseout && <div className="customer-inline-notice">
              <strong>Quyết toán tiền thuê</strong>
              <p>Ngày chấm dứt {formatPortalDate(item.earlyReturnCloseout.effectiveDate)} · {item.earlyReturnCloseout.outstandingAmount === null ? 'Cần đối soát số dư hóa đơn chung' : <>Còn phải trả khi bàn giao {moneyLabel(item.earlyReturnCloseout.outstandingAmount)}</>}.</p>
              <p>Hóa đơn được giảm {moneyLabel(item.earlyReturnCloseout.waivedAmount)}.</p>
              {item.earlyReturnCloseout.refundAmount > 0 && <p>{item.rentRefund?.refundedAt ? 'Đã chuyển tiền hoàn' : item.rentRefund?.approvedAt ? 'Đã duyệt, chờ chuyển tiền' : 'Tiền thuê dự kiến hoàn'} {moneyLabel(item.earlyReturnCloseout.refundAmount)}.</p>}
            </div>}
            <dl className="customer-record-facts">
              <div>
                <dt>Đã kiểm tra</dt>
                <dd>
                  {item.inspectionSummary.total -
                    item.inspectionSummary.pending}
                  /{item.inspectionSummary.total}
                </dd>
              </div>
              <div>
                <dt>Có vấn đề</dt>
                <dd>{item.inspectionSummary.issues}</dd>
              </div>
              <div>
                <dt>Quyết toán</dt>
                <dd>
                  {item.settlementStatus ? (
                    <CustomerStatus status={item.settlementStatus} />
                  ) : (
                    "Chưa tạo"
                  )}
                </dd>
              </div>
            </dl>
            <div
              className="customer-inspection-list"
              aria-label="Chi tiết kiểm tra từng kho"
            >
              {item.inspections.map((inspection) => (
                <p key={inspection.id}>
                  <strong>{inspection.unit.unitCode}</strong> · {inspection.contract.contractCode} ·{" "}
                  {inspection.result === "PASS"
                    ? "Đạt"
                    : inspection.result === "ISSUE_FOUND"
                      ? "Có vấn đề, chờ xử lý"
                      : "Chờ kiểm tra"}
                </p>
              ))}
            </div>
            {item.note && <p>Ghi chú: {item.note}</p>}
            {item.inventory && (item.inventory.remainingItemTypes > 0 || item.inventory.pendingMovements > 0) && <p className="customer-inline-notice">Bạn còn {item.inventory.remainingItemTypes} loại hàng và {item.inventory.pendingMovements} phiếu giao nhận đang xử lý. Cần lấy hết hàng trước khi nhận trả kho. <a href="/customer/stock-movements">Mở phiếu nhập – xuất</a></p>}
          </DetailCard>
        ))}
      </div>
      {pagination}
    </>
  );
}

function SettlementList({ items, focused }: { items: CustomerDepositSettlement[]; focused: boolean }) {
  const { items: visible, pagination } = useListPagination(items);
  if (!items.length)
    return (
      <PortalEmpty
        icon={<ClipboardCheck size={30} />}
        title="Chưa có quyết toán tiền cọc"
      >
        <span>Quyết toán được tạo sau khi NestBox hoàn tất kiểm tra trả kho.</span>
      </PortalEmpty>
    );
  return (
    <>
      <div className="customer-card-list">
        {visible.map((item) => (
          <DetailCard
                    detail={!focused ? { to: '/customer/returns' + '?' + new URLSearchParams({ settlement: item.id }), label: `Xem quyết toán cọc ${item.settlementCode}` } : undefined}
            className="customer-record-card customer-record-card--compact"
            key={item.id}
          >
            <div className="customer-record-heading">
              <div>
                <CopyRecordCode value={item.settlementCode} />
                <h2>{item.returnedUnits?.map(unit => unit.unitCode).join(', ') || item.reservation.storageType.name}</h2>
              </div>
              <CustomerStatus status={item.status} />
            </div>
            <p>
              {item.reservation.reference} · {item.returnCode}
            </p>
            <dl className="customer-record-facts">
              <div>
                <dt>Tiền cọc</dt>
                <dd>{moneyLabel(item.depositAmount)}</dd>
              </div>
              <div>
                <dt>Khấu trừ</dt>
                <dd>
                  {item.status === "PENDING_REVIEW"
                    ? "Chờ duyệt"
                    : moneyLabel(item.deductionAmount)}
                </dd>
              </div>
              <div>
                <dt>Hoàn lại</dt>
                <dd>
                  {item.status === "PENDING_REVIEW"
                    ? "Chờ duyệt"
                    : moneyLabel(item.refundAmount)}
                </dd>
              </div>
            </dl>
            {item.outstandingAmount > 0 && (
              <p className="customer-form-message is-error">
                Còn phải thanh toán: {moneyLabel(item.outstandingAmount)}
                {item.outstandingInvoice
                  ? ` · ${item.outstandingInvoice.invoiceCode}`
                  : ""}
              </p>
            )}
            {item.issues.map((issue) => (
              <p key={issue.inspectionId} className="customer-inline-notice">
                Kho {issue.unit.unitCode}:{" "}
                {issue.reason || issue.approvedIssueType} ·{" "}
                {moneyLabel(issue.approvedChargeAmount)}
              </p>
            ))}
          </DetailCard>
        ))}
      </div>
      {pagination}
    </>
  );
}
