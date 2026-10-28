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
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
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
import { isCurrentEarlyReturnApproval } from '../../utils/early-return';
import type {
  CustomerDepositSettlement,
  CustomerRental,
  CustomerReturnRequest,
  CustomerSupportRequest,
} from "../../types/customer";

export function CustomerReturnsPage() {
  const { user } = useAuth();
  const rentals = usePaginatedResource<CustomerRental>(
    "/customer/rentals?limit=100",
    user?.id ?? "",
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
  const [reservationId, setReservationId] = useState("");
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
      (new Date(item.effectiveEndDate).getTime() <= checkedAt || approvals.data?.items.some(request => request.reservation.id === item.reservationId && isCurrentEarlyReturnApproval(request, item.effectiveEndDate))) &&
      !item.pendingRenewal &&
      !activeReturnIds.has(item.reservationId),
  );
  const current = view === "returns" ? returns : settlements;
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
        description="Trả kho khi đến hạn hoặc gửi đề nghị trả trước hạn để quản lý xem xét. Theo dõi kiểm tra và quyết toán tiền cọc."
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
        <div className="customer-return-forms"><form className="customer-panel customer-module-form" onSubmit={submit}>
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
              Chọn yêu cầu thuê đã đến hạn hoặc đã được quản lý chấp thuận trả sớm. Nhân viên sẽ kiểm tra từng kho trước khi quyết toán cọc.
            </p>
            <label className="field-label">
              Yêu cầu thuê đủ điều kiện trả
              <select
                aria-label="Yêu cầu thuê đủ điều kiện trả"
                required
                value={reservationId}
                onChange={(event) => setReservationId(event.target.value)}
              >
                <option value="">Chọn kho đủ điều kiện trả</option>
                {eligibleRentals.map((item) => (
                  <option key={item.reservationId} value={item.reservationId}>
                    {item.reservationReference} · {item.storageType.name} · hết
                    hạn {formatPortalDate(item.effectiveEndDate)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Ghi chú
              <textarea
                rows={4}
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
              disabled={submitting || !reservationId}
            >
              <RotateCcw size={17} />{" "}
              {submitting ? "Đang gửi…" : "Gửi yêu cầu trả kho"}
            </button>
            {!rentals.loading && eligibleRentals.length === 0 && (
              <small>
                Chưa có kho đủ điều kiện trả ngay. Nếu muốn trả trước hạn, gửi đề nghị ở phần bên dưới.
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
                <small>{item.returnCode}</small>
                <h2>{item.reservation.storageType.name}</h2>
              </div>
              <CustomerStatus status={item.status} />
            </div>
            <p>
              {item.reservation.reference} · yêu cầu ngày{" "}
              {formatPortalDate(item.requestedAt, true)}
            </p>
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
                <small>{item.settlementCode}</small>
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
