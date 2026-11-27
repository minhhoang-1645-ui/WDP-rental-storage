import { DateTimePicker } from '../../components/workspace/DateTimeFields';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import { keyCollectionStartDate, vietnamLocalMinute } from '../../utils/handover';
import { ReturnInspectionSchedule } from '../operations/ServiceCalendarPage';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { invoicePaymentBlockedBySchedule } from '../../utils/payment-state';
import { useCallback, useRef, useState } from "react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { mutate } from "../../services/portal";
import {
  code,
  first,
  label,
  money,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import { IncidentBookingImpact } from '../../components/manager/IncidentBookingImpact';
import { TransferHandoverForm, TransferProblemForm } from '../../components/manager/TransferHandoverForm';
import { object } from '../../components/manager/portal-data';
import { renewalReviewIssue } from '../../utils/renewal-review';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { canAccessManagerReview } from '../../utils/manager-review-access';
import { CombinedReturnRefund } from '../../components/manager/EarlyReturnFinanceReview';
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { transferProblem } from '../../utils/transfer-problem';


export function ManagerActions({
  resource,
  row,
  id,
  refresh,
  onSuccess,
}: {
  resource: string;
  row: Row;
  id: string;
  refresh: () => void;
  onSuccess?: (message: string) => void;
}) {
  const { user } = useAuth();
  const confirm = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(first(row, "status"));
  const [note, setNote] = useState(first(row, "internalNotes"));
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const invalidInvoiceAmount = !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || Number(amount) > Number(row.balanceDue);
  const cashOnly = resource === 'invoices' && row.cashOnly === true;
  const [selectedMethod, setMethod] = useState("BANK_TRANSFER");
  const method = cashOnly ? 'CASH' : selectedMethod;
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState(false);
  const [renewalReviewed, setRenewalReviewed] = useState(false);
  const [maintenancePassed, setMaintenancePassed] = useState(true);
  const [priority, setPriority] = useState(first(row, "priority") || "MEDIUM");
  const [problemDecision, setProblemDecision] = useState('CONTINUE');
  const [problemNote, setProblemNote] = useState('');
  const problem = transferProblem(row);
  const [scheduleAction, setScheduleAction] = useState('RESCHEDULE');
  const [newSchedule, setNewSchedule] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const scheduleClock = useCurrentTime(resource === 'appointments' && user?.role === 'FACILITY_MANAGER');
  const [resolution, setResolution] = useState("MANAGER_RESOLVED");
  const lock = useRef(false);
  const root = `/manager/${resource}/${encodeURIComponent(id)}`;
  const appointmentContracts = resource === 'appointments' ? rows(object(row.reservation).contracts) : [];
  const leadDays = object(row.handoverReadiness).leadDays;
  const firstPickup = typeof leadDays === 'number' ? appointmentContracts
    .map(contract => keyCollectionStartDate(first(contract, 'startDate').slice(0, 10), leadDays)).filter(Boolean).sort().at(-1) : undefined;
  const lastPickup = appointmentContracts.map(contract => first(contract, 'endDate').slice(0, 10)).filter(Boolean).sort()[0];
  const scheduleLimit = lastPickup ? keyCollectionStartDate(lastPickup, 1) + 'T23:59' : undefined;
  const scheduleMinimum = (time: number) => {
    const nextMinute = vietnamLocalMinute(time + 60_000);
    return firstPickup && firstPickup > nextMinute.slice(0, 10) ? firstPickup + 'T00:00' : nextMinute;
  };
  const issueRows = rows(row.physicalInspections).filter(
    (item) => item.result === "ISSUE_FOUND",
  );
  const [issues, setIssues] = useState(() =>
    Object.fromEntries(
      issueRows.map((item) => [
        first(item, "id"),
        {
          issueType: first(item, "issueType"),
          amount: ["NORMAL_WEAR", "FACILITY_FAULT"].includes(
            first(item, "issueType"),
          )
            ? "0"
            : first(item, "issueType") === "LOST_KEY_OR_ACCESS_ITEM"
              ? "200000"
              : "",
          reason: "",
        },
      ]),
    ),
  );
  const run = useCallback(
    async (
      path: string,
      verb: "POST" | "PATCH",
      body?: Row,
      idempotent = false,
    ) => {
      if (lock.current) return;
      if (resource === 'renewals' && path.endsWith('/approve') && (!renewalReviewed || renewalReviewIssue(row))) { setError(renewalReviewIssue(row) || 'Vui lòng đối chiếu hồ sơ trước khi duyệt.'); return; }
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        if (resource === 'transfers' && user?.role === 'FACILITY_STAFF' && path.endsWith('/complete') && !await confirm({
          title: 'Hoàn tất chuyển kho?',
          description: 'Xác nhận khách đã chuyển đồ, trả quyền truy cập kho cũ và nhận quyền truy cập kho mới.',
          confirmLabel: 'Hoàn tất chuyển kho',
        })) return;
        if (path.endsWith('/review-problem') && body?.decision === 'CANCEL' && !await confirm({
          title: 'Hủy lệnh chuyển kho?', description: 'Hệ thống sẽ giải phóng phân bổ riêng của lệnh chuyển nếu đủ điều kiện.',
          confirmLabel: 'Hủy chuyển kho', destructive: true,
        })) return;
        if (path.endsWith('/schedule') && body?.action === 'NO_SHOW' && !await confirm({
          title: 'Ghi nhận khách không đến?', description: 'Lịch này sẽ bị hủy. Đơn đặt kho và hóa đơn giữ nguyên.',
          confirmLabel: 'Xác nhận hủy lịch', destructive: true,
        })) return;
        if (resource === 'invoices' && path.endsWith('/payments') && !await confirm({
          title: 'Xác nhận ghi nhận thanh toán',
          description: `Ghi nhận ${money(body?.amount)} đã nhận cho hóa đơn ${first(row, 'invoiceCode')}.`,
          confirmLabel: 'Xác nhận ghi nhận',
        })) return;
        await mutate(path, verb, body, idempotent);
        onSuccess?.("Đã lưu thao tác thành công.");
        refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Không thể thực hiện thao tác.",
        );
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [confirm, onSuccess, refresh, resource, row, renewalReviewed, user?.role],
  );
  const paymentFields = (
    <>
      <label className="field-label">
        Phương thức
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {!cashOnly && <option value="BANK_TRANSFER">Chuyển khoản</option>}
          <option value="CASH">Tiền mặt</option>
        </select>
      </label>
      {resource !== "deposit-settlements" && method === "BANK_TRANSFER" && <label className="field-label">
        Mã giao dịch ngân hàng đã kiểm tra
        <input
          value={reference}
          placeholder={resource === 'invoices' ? 'Nhập mã giao dịch' : undefined}
          maxLength={200}
          required
          onChange={(e) => setReference(e.target.value)}
        />
      </label>}
      {resource === "invoices" && method === "CASH" && <p className="staff-muted">Hệ thống sẽ sinh mã phiếu thu duy nhất và lưu người ghi nhận từ tài khoản đang đăng nhập.</p>}
      <label className="field-label">
        Ghi chú
        <textarea
          rows={3}
          placeholder={resource === 'invoices' ? 'Nhập ghi chú (nếu có)' : undefined}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {resource === "deposit-settlements" && <label className="portal-checkbox">
        <input
          type="checkbox"
          checked={received}
          onChange={(e) => setReceived(e.target.checked)}
          required
        />
        Tôi đã hoàn tiền thực tế cho khách.
      </label>}
    </>
  );
  if (!canAccessManagerReview(user?.role ?? '', resource)) return null;
  if (resource === 'support-requests' && isEarlyReturnRequest(row)) return <p>Quản lý duyệt thời điểm trả sớm. Sau đó nhân viên xử lý yêu cầu trả kho khi khách đã thanh toán đủ.</p>;
  if (user?.role === 'FACILITY_STAFF' && ['maintenance', 'support-requests'].includes(resource)) return <p>Công việc nhân viên được thực hiện tại phần thông tin hồ sơ.</p>;
  return (
    <div className="portal-form">
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      <fieldset disabled={busy}>
        {resource === 'transfers' && user?.role === 'FACILITY_STAFF' && first(row, 'assignedStaff.id') === user.id && row.status === 'APPROVED' && !row.commercial && !problem.pending &&
          (object(row.handoverReport).stagedHandover === true && !first(row, 'handoverReport.destinationAccessDeliveredAt')
            ? <form className="portal-form" onSubmit={event => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(`/staff/transfers/${encodeURIComponent(id)}/destination-handover`, 'POST', {
                destinationReady: data.get('destinationReady') === 'on', accessDelivered: data.get('accessDelivered') === 'on',
              });
            }}>
              <label className="portal-checkbox"><input name="destinationReady" type="checkbox" required />Đã kiểm tra kho đích an toàn</label>
              <label className="portal-checkbox"><input name="accessDelivered" type="checkbox" required />Đã bàn giao quyền truy cập kho đích</label>
              <button className="button-primary">Ghi nhận bàn giao kho đích</button>
            </form>
            : object(row.handoverReport).stagedHandover === true && !first(row, 'handoverReport.customerMoveReadyAt')
              ? <p role="status">Chờ khách tự chuyển tài sản và báo sẵn sàng kiểm tra kho nguồn.</p>
              : object(row.handoverReport).stagedHandover === true && !first(row, 'handoverReport.sourceInspectionStartedAt')
                ? <button className="button-primary" type="button" onClick={() => void run(`/staff/transfers/${encodeURIComponent(id)}/start-source-inspection`, 'POST', {})}>Bắt đầu kiểm tra kho cũ</button>
                : <TransferHandoverForm busy={busy}
            onSubmit={input => { void run(`/staff/transfers/${encodeURIComponent(id)}/complete`, 'POST', input); }}
            onProblem={note => { void run(`/staff/transfers/${encodeURIComponent(id)}/problem`, 'POST', { note }); }} />)}
        {resource === 'transfers' && user?.role === 'FACILITY_STAFF' && first(row, 'assignedStaff.id') === user.id
          && row.status === 'APPROVED' && !row.commercial && !problem.pending && object(row.handoverReport).stagedHandover === true
          && !first(row, 'handoverReport.sourceInspectionStartedAt') &&
          <TransferProblemForm busy={busy} onProblem={note => { void run(`/staff/transfers/${encodeURIComponent(id)}/problem`, 'POST', { note }); }} />}
        {resource === "reservations" && user?.role === 'FACILITY_MANAGER' &&
          (row.status === "PENDING" ? (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(`${root}/status`, "PATCH", { status });
              }}
            >
              <p>
                Khi thử phân bổ lại, hệ thống kiểm tra và cấp đủ{" "}
                {first(row, "quantity")} kho cho toàn bộ kỳ thuê.
              </p>
              <label className="field-label">
                Quyết định
                <select
                  required
                  value={status === "PENDING" ? "" : status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Chọn quyết định</option>
                  {["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v === 'CONFIRMED' ? 'Thử phân bổ lại' : label(v)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                className="button-primary"
                disabled={busy || status === "PENDING"}
              >
                Lưu quyết định
              </button>
            </form>
          ) : (
            <>
              <p>Yêu cầu đã được xử lý.</p>
              <Link
                className="button-secondary"
                to={`/manager/operations/invoices?search=${encodeURIComponent(code(row))}`}
              >
                Xem hóa đơn
              </Link>
              <Link
                className="button-secondary"
                to={`/manager/operations/contracts?search=${encodeURIComponent(code(row))}`}
              >
                Xem hợp đồng
              </Link>
              <Link
                className="button-secondary"
                to={`/manager/operations/appointments?search=${encodeURIComponent(code(row))}`}
              >
                Lịch bàn giao
              </Link>
            </>
          ))}
        {resource === 'returns' && user?.role === 'FACILITY_MANAGER' && row.status === 'REQUESTED' &&
          <ReturnInspectionSchedule id={id} current={first(row, 'inspectionScheduledAt') || null} onUpdated={refresh} />}
        {resource === 'appointments' && user?.role === 'FACILITY_MANAGER' && ['REQUESTED', 'CONFIRMED'].includes(String(row.status)) &&
          <form className="portal-form" onSubmit={event => {
            event.preventDefault();
            const scheduledAt = newSchedule + ':00+07:00';
            if (scheduleAction === 'RESCHEDULE' &&
              (newSchedule < scheduleMinimum(Date.now()) || (scheduleLimit && newSchedule > scheduleLimit) || Date.parse(scheduledAt) === Date.parse(first(row, 'scheduledAt')))) {
              setScheduleError('Chọn thời điểm mới trong tương lai và trong khoảng được phép bàn giao.');
              return;
            }
            void run(`${root}/schedule`, 'PATCH', {
              action: scheduleAction, expectedScheduledAt: row.scheduledAt, note: scheduleNote.trim(),
              ...(scheduleAction === 'RESCHEDULE' ? { scheduledAt } : {}),
            });
          }}>
            {first(row, 'handoverReadiness.reason', 'bookingBlockReason') && <p role="status">
              {first(row, 'handoverReadiness.reason', 'bookingBlockReason')}
            </p>}
            <label className="field-label">Xử lý lịch hẹn<select value={scheduleAction} onChange={event => setScheduleAction(event.target.value)}>
              <option value="RESCHEDULE">Đổi lịch</option>
              {row.schedulePendingManager === true && <option value="CONFIRM_EXCEPTION">Xác nhận lịch hẹn</option>}
              {Date.parse(first(row, 'scheduledAt')) < scheduleClock && <option value="NO_SHOW">Khách không đến · hủy lịch</option>}
            </select></label>
            {scheduleAction === 'RESCHEDULE' && <DateTimePicker label="Lịch mới (giờ Việt Nam)" required
              min={scheduleMinimum(scheduleClock)} max={scheduleLimit} defaultValue={newSchedule} error={scheduleError}
              onChange={value => { setNewSchedule(value); setScheduleError(''); }} />}
            <label className="field-label">Lý do<textarea required minLength={3} maxLength={1000} value={scheduleNote} onChange={event => setScheduleNote(event.target.value)} /></label>
            <button className="button-primary" disabled={busy || scheduleNote.trim().length < 3}>Lưu thay đổi lịch</button>
          </form>}
        {resource === "appointments" && user?.role === 'FACILITY_STAFF' && first(row, "assignedStaff.id") === user.id &&
          (row.status === "REQUESTED" && row.schedulePendingManager === true ? <p>Chờ quản lý xác nhận giờ hẹn.</p> : row.status === "REQUESTED" ? (
            <>
              <p>
                Xác nhận lịch nhận kho của khách. Bàn giao thực tế sẽ do nhân
                viên ghi nhận.
              </p>
              <button
                className="button-primary"
                disabled={busy}
                onClick={() => run(`${root}/confirm`, "PATCH")}
              >
                Xác nhận lịch bàn giao
              </button>
            </>
          ) : (
            <p>Lịch hẹn {label(row.status).toLowerCase()}.</p>
          ))}
        {resource === "renewals" &&
          (row.status === "PENDING" ? (
            <>
              <p>
                Khi duyệt, hệ thống kiểm tra kho trống và lập hóa đơn gia hạn. Hạn thuê
                chỉ được cập nhật khi hoàn tất thanh toán theo quy định.
              </p>
              <p className="manager-action-copy">Kiểm tra khách hàng, kho, thời gian và số tiền gia hạn trước khi duyệt.</p>
              {renewalReviewIssue(row) && <p className="booking-alert is-error" role="alert">{renewalReviewIssue(row)}</p>}
              <label className="portal-checkbox"><input type="checkbox" checked={renewalReviewed} onChange={event => setRenewalReviewed(event.target.checked)} />Tôi đã đối chiếu thông tin và báo giá gia hạn</label>
              <button
                className="button-primary"
                disabled={busy || !renewalReviewed || Boolean(renewalReviewIssue(row))}
                onClick={() => run(`${root}/approve`, "POST")}
              >
                Duyệt gia hạn
              </button>
              <form
                className="portal-form portal-form-divider"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(`${root}/reject`, "POST", { reason: reason.trim() });
                }}
              >
                <label className="field-label">
                  Lý do từ chối
                  <textarea
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="button-secondary"
                  disabled={busy || !reason.trim()}
                >
                  Từ chối gia hạn
                </button>
              </form>
            </>
          ) : (
            <p>
              {label(row.status)}. Hóa đơn gia hạn được liệt kê trong hồ sơ.
            </p>
          ))}
        {resource === "invoices" &&
          (Number(row.balanceDue) > 0 && invoicePaymentBlockedBySchedule(row) ? <p>Hóa đơn gia hạn chưa đến kỳ thanh toán.</p> : row.status !== "PAID" && Number(row.balanceDue) > 0 ? (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(amount);
                if (
                  !Number.isSafeInteger(value) ||
                  value <= 0 ||
                  value > Number(row.balanceDue)
                ) {
                  setError(
                    "Số tiền phải là số nguyên VND dương và không vượt số còn thu.",
                  );
                  return;
                }
                run(
                  `${root}/payments`,
                  "POST",
                  {
                    amount: value,
                    method,
                    reference: method === "BANK_TRANSFER" ? reference.trim() : undefined,
                    note: note.trim() || undefined,
                  },
                  true,
                );
              }}
            >
              <div className="invoice-payment-amount"><label className="field-label">
                Số tiền nhận (VND)
                <input
                  type="number"
                  required
                  min={1}
                  max={Number(row.balanceDue)}
                  step={1}
                  placeholder="Nhập số tiền"
                  aria-invalid={Boolean(amount) && invalidInvoiceAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setAmount(String(row.balanceDue))}
              >
                Điền số còn thu
              </button></div>
              {Boolean(amount) && invalidInvoiceAmount && <small role="status">Nhập số tiền nguyên dương, tối đa {money(row.balanceDue)}.</small>}
              {paymentFields}
              <button
                className="button-primary"
                disabled={busy || invalidInvoiceAmount || (method === "BANK_TRANSFER" && !reference.trim())}
              >
                Ghi nhận thanh toán
              </button>
            </form>
          ) : (
            <p>Hóa đơn đã được thanh toán đầy đủ.</p>
          ))}
        {resource === "deposit-settlements" &&
          (row.status === "PENDING_REVIEW" ? (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                const payload = issueRows.map((item) => {
                  const draft = issues[first(item, "id")];
                  return {
                    inspectionId: item.id,
                    issueType: draft.issueType,
                    approvedChargeAmount: Number(draft.amount),
                    reason: draft.reason.trim() || undefined,
                  };
                });
                if (
                  payload.some(
                    (item) =>
                      !Number.isSafeInteger(item.approvedChargeAmount) ||
                      item.approvedChargeAmount < 0,
                  ) ||
                  issueRows.some(
                    (item) => issues[first(item, "id")].amount === "",
                  )
                ) {
                  setError("Vui lòng nhập số tiền được duyệt cho từng vấn đề.");
                  return;
                }
                run(
                  `${root}/review`,
                  "POST",
                  { issues: payload, note: note.trim() || undefined },
                  true,
                );
              }}
            >
              <p>
                Duyệt toàn bộ vấn đề kiểm tra. Hao mòn thông thường và lỗi cơ sở
                không thu phí khách.
              </p>
              {issueRows.map((item) => {
                const key = first(item, "id");
                const draft = issues[key];
                const noCharge = [
                  "NORMAL_WEAR",
                  "FACILITY_FAULT",
                  "LOST_KEY_OR_ACCESS_ITEM",
                ].includes(draft.issueType);
                const update = (value: Partial<typeof draft>) =>
                  setIssues((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], ...value },
                  }));
                return (
                  <div className="portal-issue" key={key}>
                    <strong>{first(item, "unit.unitCode")}</strong>
                    <p>{first(item, "issueNote")}</p>
                    <label className="field-label">
                      Phân loại trách nhiệm
                      <select
                        value={draft.issueType}
                        onChange={(e) =>
                          update({
                            issueType: e.target.value,
                            amount: ["NORMAL_WEAR", "FACILITY_FAULT"].includes(
                              e.target.value,
                            )
                              ? "0"
                              : e.target.value === "LOST_KEY_OR_ACCESS_ITEM"
                                ? "200000"
                                : "",
                          })
                        }
                      >
                        {[
                          "NORMAL_WEAR",
                          "FACILITY_FAULT",
                          "CUSTOMER_DAMAGE",
                          "CLEANING_REQUIRED",
                          "LOST_KEY_OR_ACCESS_ITEM",
                          "OTHER",
                        ].map((v) => (
                          <option key={v} value={v}>
                            {label(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Phí được duyệt (VND)
                      <input
                        type="number"
                        min={0}
                        step={1}
                        required
                        disabled={noCharge}
                        value={draft.amount}
                        onChange={(e) => update({ amount: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      Căn cứ duyệt
                      <input
                        required={
                          Number(draft.amount) > 0 ||
                          draft.issueType === "OTHER"
                        }
                        minLength={3}
                        maxLength={2000}
                        value={draft.reason}
                        onChange={(e) => update({ reason: e.target.value })}
                      />
                    </label>
                  </div>
                );
              })}
              <label className="field-label">
                Ghi chú duyệt
                <textarea
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                className="button-primary"
                disabled={busy || !issueRows.length}
              >
                Duyệt quyết toán
              </button>
            </form>
          ) : row.earlyReturnSettlement ? null : row.status === "APPROVED" &&
            Number(row.refundAmount) > 0 &&
            Number(row.outstandingAmount) === 0 ? (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (received)
                  run(
                    `${root}/refund`,
                    "POST",
                    {
                      method,
                      refundConfirmed: true,
                      note: note.trim() || undefined,
                    },
                    true,
                  );
              }}
            >
              <p>
                Tiền cọc cần hoàn <strong>{money(row.refundAmount)}</strong>. Ghi
                nhận sau khi đã hoàn tiền cho khách.
              </p>
              {paymentFields}
              <button
                className="button-primary"
                disabled={busy || !received}
              >
                Ghi nhận hoàn tiền
              </button>
            </form>
          ) : (
            <p>
              {label(row.status)}.
              {row.status === "AWAITING_OUTSTANDING_PAYMENT"
                ? " Thu đủ hóa đơn bổ sung để hoàn tất quyết toán."
                : ""}
            </p>
          ))}
        {resource === 'deposit-settlements' && Boolean(row.earlyReturnSettlement) && <CombinedReturnRefund
          row={row} busy={busy} onConfirm={body => void run(`${root}/confirm-return-refund`, 'POST', body, true)} />}
        {resource === 'maintenance' && user?.role === 'FACILITY_MANAGER'
          && ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION'].includes(String(row.status)) && (
          <DetailDisclosure title="Đánh giá ảnh hưởng đến cho thuê">
            <IncidentBookingImpact key={first(row, 'updatedAt')} row={row} root={root} busy={busy}
              onSave={(affectedUnitIds, expectedAffectedUnitIds) => void run(`${root}/booking-impact`, 'PATCH', { affectedUnitIds, expectedAffectedUnitIds }, true)} />
          </DetailDisclosure>
        )}
        {resource === 'maintenance' && row.status === 'AWAITING_VERIFICATION' && (
          <form className="portal-form" onSubmit={event => {
            event.preventDefault();
            if (maintenancePassed) void run(`${root}/verify`, 'POST', { note: note.trim() || undefined }, true);
            else if (reason.trim()) void run(`${root}/reject-verification`, 'POST', { note: reason.trim() }, true);
          }}>
            <label className="field-label">Kết quả nghiệm thu
              <select value={maintenancePassed ? 'pass' : 'rework'} onChange={event => setMaintenancePassed(event.target.value === 'pass')}>
                <option value="pass">Đạt</option>
                <option value="rework">Cần sửa lại</option>
              </select>
            </label>
            <label className="field-label">
              {maintenancePassed ? 'Ghi chú nghiệm thu' : 'Yêu cầu sửa lại'}
              <textarea required={!maintenancePassed} rows={3} maxLength={4000}
                value={maintenancePassed ? note : reason} onChange={event => (maintenancePassed ? setNote : setReason)(event.target.value)} />
            </label>
            {maintenancePassed && Boolean(row.blocksUnit) && <p className="record-attribution">Nghiệm thu gỡ khóa do phiếu này tạo. Những khóa khác và lịch thuê vẫn được áp dụng.</p>}
            <button className="button-primary" disabled={busy || !maintenancePassed && !reason.trim()}>
              {busy ? 'Đang lưu…' : maintenancePassed ? 'Nghiệm thu hoàn tất' : 'Trả về sửa tiếp'}
            </button>
          </form>
        )}
        {resource === "support-requests" && row.status === "ESCALATED" && (
          <form
            className="portal-form portal-form-divider"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                `${root}/resolve`,
                "POST",
                { resolutionType: resolution, resolutionNote: note.trim() },
                true,
              );
            }}
          >
            <label className="field-label">
              Kết quả xử lý
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                {[
                  "MANAGER_RESOLVED",
                  "TRANSFER_RECOMMENDED",
                  "NO_ACTION_REQUIRED",
                  "OTHER",
                ].map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Nội dung giải quyết
              <textarea
                required
                maxLength={4000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button className="button-primary" disabled={busy || !note.trim()}>
              Hoàn tất hỗ trợ
            </button>
          </form>
        )}
        {resource === "support-requests" &&
          !["RESOLVED", "ESCALATED"].includes(first(row, "status")) && (
            <p>
              Nhân viên phụ trách xử lý yêu cầu và xem xét khi yêu cầu
              được chuyển lên.
            </p>
          )}
        {resource === "support-requests" &&
          row.resolutionType === "TRANSFER_RECOMMENDED" && (
            <p>Đã ghi nhận đề nghị chuyển kho. Nhân viên tiếp nhận và thực hiện tại mục Chuyển kho.</p>
          )}
        {["maintenance", "support-requests"].includes(resource) &&
          !["COMPLETED", "RESOLVED"].includes(first(row, "status")) && (
            <DetailDisclosure title="Đổi mức ưu tiên">

              <form
                className="portal-form portal-form-divider"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(`${root}/priority`, "PATCH", { priority }, true);
                }}
              >
                <label className="field-label">
                  Ưu tiên
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {(resource === 'maintenance' ? ["LOW", "MEDIUM", "HIGH", "URGENT"] : ["LOW", "MEDIUM", "HIGH"]).map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button-secondary"
                  disabled={busy || priority === row.priority}
                >
                  Cập nhật ưu tiên
                </button>
              </form>
            </DetailDisclosure>
          )}
        {resource === 'transfers' && user?.role === 'FACILITY_MANAGER' && problem.pending &&
          <form className="portal-form" onSubmit={event => {
            event.preventDefault();
            void run(`${root}/review-problem`, 'POST', {
              decision: problemDecision, note: problemNote.trim(), expectedProblemCount: problem.count,
              destinationAccessRevoked: new FormData(event.currentTarget).get('destinationAccessRevoked') === 'on',
              destinationEmpty: new FormData(event.currentTarget).get('destinationEmpty') === 'on',
            });
          }}>
            <label className="field-label">Xử lý vướng mắc<select value={problemDecision} onChange={event => setProblemDecision(event.target.value)}>
              <option value="CONTINUE">Cho tiếp tục bàn giao</option><option value="CANCEL">Hủy chuyển kho</option>
            </select></label>
            <label className="field-label">Kết quả xử lý<textarea required minLength={3} maxLength={2000} value={problemNote} onChange={event => setProblemNote(event.target.value)} /></label>
            {problemDecision === 'CANCEL' && first(row, 'handoverReport.destinationAccessDeliveredAt') && <>
              <label className="portal-checkbox"><input type="checkbox" name="destinationEmpty" required />Đã xác nhận kho đích trống</label>
              <label className="portal-checkbox"><input type="checkbox" name="destinationAccessRevoked" required />Đã thu hồi quyền truy cập kho đích</label>
            </>}
            <button className="button-primary" disabled={busy || problemNote.trim().length < 3}>Lưu quyết định</button>
          </form>}
        {resource === "transfers" && user?.role === "FACILITY_MANAGER" && row.status !== "REQUESTED" &&
            <p>
              {row.status === 'COMPLETED' ? 'Đã hoàn tất chuyển kho thực tế. Hợp đồng hiện dùng kho đích.' : row.status === 'REJECTED' ? 'Lệnh chuyển đã bị từ chối; kho sử dụng chưa thay đổi.' : 'Đã duyệt kho đích.'}
              {row.status === 'APPROVED' && <> <Link to={`/manager/assignments?kind=transfers&record=${encodeURIComponent(id)}`}>{first(row, 'assignedStaff.id') ? 'Đổi nhân viên' : 'Phân công hồ sơ cũ'}</Link></>}
            </p>
          }
        {[
          "contracts",
          "rentals",
          "payments",
          "returns",
          "customers",
          "units",
        ].includes(resource) && (
          <>
            <p>
              {resource === "returns"
                ? "Nhân viên tiếp nhận kho và ghi nhận kiểm tra thực tế. Quản lý theo dõi và duyệt quyết toán cọc."
                : resource === "units"
                  ? "Theo dõi tình trạng và lịch phân bổ kho. Trạng thái kho được cập nhật qua các nghiệp vụ bàn giao, trả kho và nghiệm thu."
                  : "Thông tin được cập nhật theo nghiệp vụ liên quan."}
            </p>
            {resource === 'returns' && row.relocationSafetyRequired === true && !row.relocationSafetyConfirmed && !row.physicallyReturnedAt && <div className="portal-form">
              <label className="field-label">Căn cứ an toàn thu hồi kho<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000}/></label>
              <button type="button" className="button-primary" disabled={busy || reason.trim().length < 3} onClick={()=>void run(root+'/authorize-safety','PATCH',{evidence:reason})}>Xác nhận an toàn bàn giao</button>
            </div>}
            {resource === "units" && row.activeMaintenance && (
              <Link
                className="button-secondary"
                to={`/manager/operations/maintenance/${encodeURIComponent(first(row, "activeMaintenance.id"))}`}
              >
                Mở hồ sơ bảo trì
              </Link>
            )}
          </>
        )}
      </fieldset>
      {busy && <p role="status">Đang lưu thao tác…</p>}
    </div>
  );
}
