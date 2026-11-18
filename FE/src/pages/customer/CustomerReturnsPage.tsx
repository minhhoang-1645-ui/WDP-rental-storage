import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { EntitySelect } from '../../components/EntitySelect';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
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
import { Link } from 'react-router-dom';
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
import { useScopedSelection } from '../../components/customer/useScopedSelection';
import { isCurrentEarlyReturnApproval } from '../../utils/early-return';
import { vietnamCalendarDate } from '../../utils/business-date';
import { ReturnInventoryNotice } from '../../components/customer/ReturnInventoryNotice';
import type {
  CustomerDepositSettlement,
  CustomerRental,
  CustomerReturnRequest,
  CustomerSupportRequest,
} from "../../types/customer";

function outstandingForReturn(rental: CustomerRental): number | null {
  const value = rental.returnReadiness ? rental.returnReadiness.totalOutstanding : rental.paymentDetails?.totalOutstanding ?? rental.billingSummary?.totalOutstanding;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isFullySettled(rental: CustomerRental) {
  return outstandingForReturn(rental) === 0 && rental.returnReadiness?.canReturn !== false;
}

export function CustomerReturnsPage() {
  const { user } = useAuth();
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
  const [view, setView] = useState<"returns" | "settlements">("returns");
  const approvals = usePaginatedResource<CustomerSupportRequest>('/customer/support-requests?limit=100', user?.id ?? '', true);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setCheckedAt(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const activeReturnIds = new Set(
    (returns.data?.items ?? [])
      .filter((item) => item.status !== "COMPLETED")
      .map((item) => item.reservation.id),
  );
  const eligibleRentals = (rentals.data?.items ?? []).filter(
    (item) =>
      (item.effectiveEndDate.slice(0, 10) <= vietnamCalendarDate(checkedAt) || approvals.data?.items.some(request => request.reservation.id === item.reservationId && isCurrentEarlyReturnApproval(request, item.effectiveEndDate))) &&
      !item.pendingRenewal &&
      !activeReturnIds.has(item.reservationId),
  );
  const current = view === "returns" ? returns : settlements;
  const [reservationId, setReservationId] = useScopedSelection('reservation', eligibleRentals.map(item => ({ value: item.reservationId, aliases: [item.reservationReference] })));
  const selectedRental = eligibleRentals.find(item => item.reservationId === reservationId);
  const selectedDebt = selectedRental ? outstandingForReturn(selectedRental) : null;
  const canSubmitReturn = Boolean(selectedRental && isFullySettled(selectedRental));
  const refresh = () => {
    setCheckedAt(Date.now());
    returns.refresh();
    settlements.refresh();
    rentals.refresh();
    approvals.refresh();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setMessage(null);
    setSubmitting(true);
    try {
      const selectedRental = eligibleRentals.find(item => item.reservationId === reservationId);
      if (!selectedRental || !isFullySettled(selectedRental)) throw new Error('Hãy thanh toán đủ các hóa đơn còn hiệu lực, kể cả các kỳ đã cam kết chưa đến hạn, trước khi gửi yêu cầu trả kho.');
      await mutate<CustomerReturnRequest>(
        "/customer/returns",
        "POST",
        { reservationId, note: note.trim() || undefined },
        true,
      );
      setMessage({ kind: "ok", text: "Đã gửi yêu cầu trả kho." });
      setReservationId("");
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
    <section className="customer-page">
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
      <ReturnInventoryNotice />
      <div className="customer-module-layout">
        <section className="customer-panel">
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
          </div>
          {[returns.status, settlements.status, rentals.status].includes(
            401,
          ) ? (
            <CustomerSessionExpired />
          ) : current.loading ? (
            <PortalLoading label="Đang tải dữ liệu trả kho…" />
          ) : current.error ? (
            <PortalError message={current.error} onRetry={refresh} />
          ) : view === "returns" ? (
            <ReturnList items={returns.data?.items ?? []} />
          ) : (
            <SettlementList items={settlements.data?.items ?? []} />
          )}
        </section>
        <div className="customer-return-forms"><form id="return-request-form" className="customer-panel customer-module-form" onSubmit={submit}>
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
            <p>
              Chọn đơn đã đến hạn hoặc được duyệt trả sớm. Yêu cầu áp dụng cho toàn bộ kho trong đơn. Vui lòng thanh toán đủ các hóa đơn, kể cả kỳ cam kết chưa đến hạn.
            </p>
            <label className="field-label">
              Yêu cầu thuê đủ điều kiện trả
              <EntitySelect
                aria-label="Yêu cầu thuê đủ điều kiện trả"
                required
                value={reservationId}
                onValueChange={(selectedValue) => setReservationId(selectedValue)}
              >
                <option value="">Chọn kho muốn trả</option>
                {eligibleRentals.map((item) => (
                  <option key={item.reservationId} value={item.reservationId}>
                    {item.contracts.map(contract => contract.unit.unitCode).join(', ') || item.storageType.name} · {isFullySettled(item) ? 'Đã thanh toán đủ' : outstandingForReturn(item) === null ? 'Cần kiểm tra khoản còn thiếu' : `Cần thanh toán ${moneyLabel(outstandingForReturn(item))}`} · {item.reservationReference}
                  </option>
                ))}
              </EntitySelect>
            </label>
            {selectedRental && <div className={`return-payment-state ${canSubmitReturn ? 'is-settled' : ''}`} role="region" aria-label="Thanh toán của kho muốn trả">
              <strong>{canSubmitReturn ? 'Đã thanh toán đủ · Có thể gửi yêu cầu trả kho' : selectedDebt === null || selectedDebt === 0 ? 'Cần kiểm tra khoản còn thiếu' : 'Cần thanh toán trước khi trả kho'}</strong>
              <p>{canSubmitReturn ? 'Nhân viên sẽ kiểm tra kho và xử lý tiền cọc sau khi nhận yêu cầu.' : selectedDebt === null || selectedDebt === 0 ? 'Chưa xác định được số tiền còn thiếu. Hãy làm mới hoặc liên hệ nhân viên.' : <>Chưa thanh toán: <strong>{moneyLabel(selectedDebt)}</strong>.</>}</p>
              {!canSubmitReturn && selectedDebt !== null && selectedDebt > 0 && <Link className="button-primary" to={`/customer/payments?reservation=${encodeURIComponent(selectedRental.reservationId)}`}>Thanh toán các hóa đơn</Link>}
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
              {submitting ? "Đang gửi…" : "Gửi yêu cầu trả kho"}
            </button>
            {!rentals.loading && eligibleRentals.length === 0 && (
              <small>
                Chưa có kho đến hạn hoặc được chấp thuận trả sớm. Bạn có thể gửi đề nghị trả trước hạn bên dưới.
              </small>
            )}
          </fieldset>
        </form><EarlyReturnPanel checkedAt={checkedAt} rentals={rentals.data?.items ?? []} activeReturnIds={activeReturnIds} onUpdated={approvals.refresh} /></div>
      </div>
    </section>
  );
}

function ReturnList({ items }: { items: CustomerReturnRequest[] }) {
  const { items: visible, pagination } = useCustomerPagination(items);
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
          <article
            className="customer-record-card customer-record-card--compact"
            key={item.id}
          >
            <div className="customer-record-heading">
              <div>
                <CopyRecordCode value={item.returnCode} />
                <h2>{item.reservation.storageType.name}</h2>
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
                  <strong>{inspection.unit.unitCode}</strong> ·{" "}
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
          </article>
        ))}
      </div>
      {pagination}
    </>
  );
}

function SettlementList({ items }: { items: CustomerDepositSettlement[] }) {
  const { items: visible, pagination } = useCustomerPagination(items);
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
          <article
            className="customer-record-card customer-record-card--compact"
            key={item.id}
          >
            <div className="customer-record-heading">
              <div>
                <CopyRecordCode value={item.settlementCode} />
                <h2>{item.reservation.storageType.name}</h2>
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
          </article>
        ))}
      </div>
      {pagination}
    </>
  );
}
