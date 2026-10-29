import { useCallback, useRef, useState } from "react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { mutate } from "../../services/portal";
import {
  at,
  code,
  first,
  label,
  money,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import { RecordPicker } from "../../components/manager/PortalUi";
import { renewalReviewIssue } from '../../utils/renewal-review';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { canAccessManagerReview } from '../../utils/manager-review-access';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(first(row, "status"));
  const [note, setNote] = useState(first(row, "internalNotes"));
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState(false);
  const [renewalReviewed, setRenewalReviewed] = useState(false);
  const [priority, setPriority] = useState(first(row, "priority") || "MEDIUM");
  const [target, setTarget] = useState("");
  const [resolution, setResolution] = useState("MANAGER_RESOLVED");
  const lock = useRef(false);
  const root = `/manager/${resource}/${encodeURIComponent(id)}`;
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
    [onSuccess, refresh, resource, row, renewalReviewed],
  );
  const paymentFields = (
    <>
      <label className="field-label">
        Phương thức
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
        </select>
      </label>
      <label className="field-label">
        Mã tham chiếu giao dịch
        <input
          value={reference}
          maxLength={200}
          required={resource === "deposit-settlements"}
          minLength={resource === "deposit-settlements" ? 2 : undefined}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label className="field-label">
        Ghi chú
        <textarea
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="portal-checkbox">
        <input
          type="checkbox"
          checked={received}
          onChange={(e) => setReceived(e.target.checked)}
          required
        />
        {resource === "deposit-settlements"
          ? "Tôi đã hoàn tiền thực tế cho khách."
          : "Tôi đã nhận và đối chiếu khoản tiền này."}
      </label>
    </>
  );
  if (!canAccessManagerReview(user?.role ?? '', resource)) return null;
  if (resource === 'support-requests' && isEarlyReturnRequest(row)) return <p>Đề nghị trả trước hạn thuộc quản lý xem xét công nợ và điều kiện. Nhân viên xử lý hồ sơ trả kho sau khi đề nghị được chấp thuận.</p>;
  if (user?.role === 'STAFF' && ['maintenance', 'support-requests'].includes(resource)) return <p>Công việc nhân viên được thực hiện tại phần thông tin hồ sơ.</p>;
  return (
    <div className="portal-form">
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      <fieldset disabled={busy}>
        {resource === 'transfers' && user?.role === 'STAFF' && row.status === 'APPROVED' && <form className="portal-form" onSubmit={event => { event.preventDefault(); void run(`/staff/transfers/${encodeURIComponent(id)}/complete`, 'POST'); }}><p>Chỉ xác nhận sau khi đã chuyển hàng thực tế sang kho đích.</p><label className="portal-checkbox"><input type="checkbox" required />Tôi đã đối chiếu và hoàn tất chuyển kho thực tế</label><button className="button-primary" disabled={busy}>Hoàn tất chuyển kho</button></form>}
        {resource === "reservations" &&
          (row.status === "PENDING" ? (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(`${root}/status`, "PATCH", { status });
              }}
            >
              <p>
                Xác nhận sẽ kiểm tra lại khả dụng và phân bổ đủ{" "}
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
                        {label(v)}
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
        {resource === "inquiries" &&
          (row.requestType === "RESERVATION" ? (
            <Link
              className="button-primary"
              to={`/manager/reservations/${encodeURIComponent(id)}`}
            >
              Xử lý đặt kho
            </Link>
          ) : (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(root, "PATCH", { status, internalNotes: note.trim() });
              }}
            >
              <p>Yêu cầu tư vấn chưa giữ kho và chưa tạo hợp đồng.</p>
              <label className="field-label">
                Trạng thái liên hệ
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    "PENDING_CONTACT",
                    "CONTACTED",
                    "IN_REVIEW",
                    "CLOSED",
                    "CANCELLED",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Ghi chú nội bộ
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button className="button-primary" disabled={busy}>
                Lưu cập nhật
              </button>
            </form>
          ))}
        {resource === "appointments" &&
          (row.status === "REQUESTED" ? (
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
                Duyệt sẽ kiểm tra xung đột lịch và tạo hóa đơn gia hạn. Thời hạn
                chỉ được cập nhật khi hoàn tất thanh toán theo quy định.
              </p>
              <p className="manager-action-copy">Đối chiếu khách hàng, hợp đồng/kho, hạn cũ–mới, báo giá chốt và kế hoạch hóa đơn ở mục “Thông tin đối chiếu gia hạn”.</p>
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
          (row.status !== "PAID" && Number(row.balanceDue) > 0 ? (
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
                if (!received) return;
                run(
                  `${root}/payments`,
                  "POST",
                  {
                    amount: value,
                    method,
                    reference: reference.trim() || undefined,
                    note: note.trim() || undefined,
                  },
                  true,
                );
              }}
            >
              <p>
                Ghi nhận khoản thu đã nhận thực tế. Còn thu:{" "}
                <strong>{money(row.balanceDue)}</strong>.
              </p>
              <label className="field-label">
                Số tiền nhận (VND)
                <input
                  type="number"
                  required
                  min={1}
                  max={Number(row.balanceDue)}
                  step={1}
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
              </button>
              {paymentFields}
              <button
                className="button-primary"
                disabled={busy || !received || !amount}
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
          ) : row.status === "APPROVED" &&
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
                      reference: reference.trim(),
                      note: note.trim() || undefined,
                    },
                    true,
                  );
              }}
            >
              <p>
                Khoản cần hoàn: <strong>{money(row.refundAmount)}</strong>. Ghi
                nhận sau khi đã hoàn tiền cho khách.
              </p>
              {paymentFields}
              <button
                className="button-primary"
                disabled={busy || !received || !reference.trim()}
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
        {["maintenance", "support-requests"].includes(resource) &&
          !["COMPLETED", "RESOLVED"].includes(first(row, "status")) && (
            <>

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
                    {["LOW", "MEDIUM", "HIGH"].map((v) => (
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
            </>
          )}
        {resource === "maintenance" &&
          row.status === "AWAITING_VERIFICATION" && (
            <>
              <form
                className="portal-form portal-form-divider"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    `${root}/verify`,
                    "POST",
                    { note: note.trim() || undefined },
                    true,
                  );
                }}
              >
                <p>
                  Nghiệm thu hoàn tất sẽ đưa kho trở lại trạng thái sẵn sàng.
                </p>
                <label className="field-label">
                  Ghi chú nghiệm thu
                  <textarea
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="button-primary" disabled={busy}>
                  Nghiệm thu hoàn tất
                </button>
              </form>
              <form
                className="portal-form portal-form-divider"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    `${root}/reject-verification`,
                    "POST",
                    { note: reason.trim() },
                    true,
                  );
                }}
              >
                <label className="field-label">
                  Yêu cầu sửa lại
                  <textarea
                    required
                    maxLength={4000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="button-secondary"
                  disabled={busy || !reason.trim()}
                >
                  Trả về sửa tiếp
                </button>
              </form>
            </>
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
        {resource === "transfers" &&
          (row.status === "REQUESTED" ? (
            <>
              <form
                className="portal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(`${root}/approve`, "POST", {
                    toStorageUnitId: target,
                  });
                }}
              >
                <p>
                  Chọn kho cùng loại. Khả dụng toàn kỳ sẽ được kiểm tra lại khi
                  duyệt.
                </p>
                <RecordPicker
                  path={`/manager/units?status=AVAILABLE&storageType=${encodeURIComponent(first(row, "fromUnit.storageType.id"))}`}
                  title="Kho đích"
                  value={target}
                  onChange={setTarget}
                  accept={(item) => item.id !== at(row, "fromUnit.id")}
                  describe={(item) =>
                    `${code(item)} · ${first(item, "floor")} · ${first(item, "zone")}`
                  }
                />
                <button className="button-primary" disabled={busy || !target}>
                  Duyệt chuyển kho
                </button>
              </form>
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => run(`${root}/reject`, "POST")}
              >
                Từ chối chuyển kho
              </button>
            </>
          ) : (
            <p>
              {row.status === 'COMPLETED' ? 'Đã hoàn tất chuyển kho thực tế. Hợp đồng hiện dùng kho đích.' : row.status === 'REJECTED' ? 'Lệnh chuyển đã bị từ chối; kho sử dụng chưa thay đổi.' : 'Đã duyệt kho đích. Chỉ hoàn tất khi đã chuyển hàng và bàn giao thực tế.'}
            </p>
          ))}
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
