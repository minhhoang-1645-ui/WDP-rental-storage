import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
import { mutate } from "../../services/portal";
import {
  first,
  label,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import type { StaffResource } from "./staff-resources";
import { handoverCompletionIssue } from '../../utils/handover';

export function StaffActions({
  resource,
  row,
  id,
  refresh,
  onSuccess,
}: {
  resource: StaffResource;
  row: Row;
  id: string;
  refresh: () => void;
  onSuccess: (message: string) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    if (resource !== 'appointments' || row.status !== 'CONFIRMED') return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [resource, row.status]);
  const handoverContracts = rows(row.allocatedUnits);
  const handoverIssue = resource === 'appointments' ? handoverCompletionIssue(row.scheduledAt, currentTime, handoverContracts) : '';
  const root = `/staff/${resource}/${encodeURIComponent(id)}`;
  const assigned = first(row, "assignedStaff.id") === user?.id;
  const run = async (
    suffix: string,
    method: "POST" | "PATCH" = "POST",
    input?: Row,
    idempotent = false,
  ) => {
    if (lock.current || user?.role !== "STAFF") return;
    if (resource === 'appointments' && suffix === '/complete-handover') {
      const issue = handoverCompletionIssue(row.scheduledAt, Date.now(), handoverContracts);
      if (issue) { setError(issue); return; }
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(root + suffix, method, input, idempotent);
      onSuccess("Đã lưu thao tác thành công.");
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
  };
  const submit = (
    event: FormEvent<HTMLFormElement>,
    suffix: string,
    field: string,
    idempotent = false,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(
      suffix,
      "POST",
      { [field]: String(data.get(field) ?? "").trim() || undefined },
      idempotent,
    );
  };
  const inspections = rows(row.inspections);
  const inspecting = ["INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
    String(row.status),
  );
  const allInspected =
    inspections.length > 0 &&
    inspections.every(
      (item) =>
        ["PASS", "ISSUE_FOUND"].includes(String(item.result)) &&
        (item.result !== "ISSUE_FOUND" || first(item, "issueType")),
    );
  return (
    <section className="manager-section">
      <h2>Thao tác nhân viên</h2>
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      <fieldset className="portal-action-fieldset" disabled={busy}>
        {resource === "appointments" &&
          (row.status === "CONFIRMED" ? (
            <form
              className="portal-form"
              onSubmit={(event) => submit(event, "/complete-handover", "note")}
            >
              {handoverIssue && <p className="booking-alert" role="status">{handoverIssue}</p>}
              <label className="field-label">
                Ghi chú bàn giao
                <textarea name="note" maxLength={2000} rows={3} />
              </label>
              <label className="portal-checkbox">
                <input name="received" type="checkbox" required />
                Đã bàn giao thực tế đầy đủ các kho trong lịch này
              </label>
              <button className="button-primary" disabled={Boolean(handoverIssue)}>Hoàn tất bàn giao</button>
            </form>
          ) : (
            <p>
              {row.status === "REQUESTED"
                ? "Chờ quản lý xác nhận lịch trước khi bàn giao."
                : "Lịch này không còn thao tác bàn giao."}
            </p>
          ))}
        {resource === "returns" && (
          <>
            {row.status === "REQUESTED" && (
              <button
                className="button-primary"
                onClick={() => void run("/start-inspection")}
              >
                Bắt đầu kiểm tra
              </button>
            )}
            {inspecting && (
              <>
                <p>
                  Ghi nhận hiện trạng từng kho. Việc xác định trách nhiệm và chi
                  phí do quản lý duyệt.
                </p>
                {inspections.map((item) => (
                  <InspectionEditor
                    key={`${first(item, "id")}:${item.result}:${item.inspectedAt}`}
                    inspection={item}
                    save={(input) =>
                      run(
                        `/inspections/${encodeURIComponent(first(item, "id"))}`,
                        "PATCH",
                        input,
                      )
                    }
                  />
                ))}
                <form
                  className="portal-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (allInspected) void run("/finalize");
                  }}
                >
                  <label className="portal-checkbox">
                    <input type="checkbox" required disabled={!allInspected} />
                    Đã nhận lại thực tế toàn bộ kho và ghi đủ kết quả kiểm tra
                  </label>
                  <button className="button-primary" disabled={!allInspected}>
                    Hoàn tất nhận kho trả
                  </button>
                  {!allInspected && (
                    <small>
                      Cần ghi kết quả cho tất cả kho trước khi hoàn tất.
                    </small>
                  )}
                </form>
              </>
            )}
            {!inspecting && row.status !== "REQUESTED" && (
              <p>
                Đã nhận kho trả. Quyết toán tiền cọc được quản lý xử lý riêng.
              </p>
            )}
          </>
        )}
        {resource === "maintenance" && (
          <>
            {!assigned &&
              !["COMPLETED", "AWAITING_VERIFICATION"].includes(
                String(row.status),
              ) && (
                <p>Chỉ nhân viên được phân công mới được xử lý hồ sơ này.</p>
              )}
            {assigned && row.status === "OPEN" && (
              <button
                className="button-primary"
                onClick={() => void run("/start", "POST", undefined, true)}
              >
                Bắt đầu sửa chữa
              </button>
            )}
            {assigned && row.status === "IN_PROGRESS" && (
              <form
                className="portal-form"
                onSubmit={(event) =>
                  submit(event, "/complete-work", "workNote", true)
                }
              >
                <label className="field-label">
                  Kết quả sửa chữa
                  <textarea
                    name="workNote"
                    required
                    minLength={3}
                    maxLength={4000}
                    rows={4}
                  />
                </label>
                <button className="button-primary">
                  Gửi kết quả để nghiệm thu
                </button>
              </form>
            )}
            {row.status === "AWAITING_VERIFICATION" && (
              <p>Đang chờ quản lý nghiệm thu. Kho vẫn ở trạng thái bảo trì.</p>
            )}
            {row.status === "COMPLETED" && (
              <p>Đã nghiệm thu và hoàn tất bảo trì.</p>
            )}
          </>
        )}
        {resource === "support-requests" && (
          <>
            {!assigned &&
              !["ESCALATED", "RESOLVED"].includes(String(row.status)) && (
                <p>Chỉ nhân viên được phân công mới được xử lý yêu cầu này.</p>
              )}
            {assigned && row.status === "ASSIGNED" && (
              <button
                className="button-primary"
                onClick={() => void run("/start", "POST", undefined, true)}
              >
                Bắt đầu hỗ trợ
              </button>
            )}
            {assigned && row.status === "IN_PROGRESS" && (
              <>
                <form
                  className="portal-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run(
                      "/resolve",
                      "POST",
                      {
                        resolutionType: data.get("resolutionType"),
                        resolutionNote: String(
                          data.get("resolutionNote"),
                        ).trim(),
                      },
                      true,
                    );
                  }}
                >
                  <label className="field-label">
                    Kết quả hỗ trợ
                    <select name="resolutionType" aria-label="Kết quả hỗ trợ">
                      {[
                        "ON_SITE_RESOLVED",
                        "CUSTOMER_GUIDANCE",
                        "ACCESS_RESTORED",
                        "PAYMENT_GUIDANCE",
                        "NO_ACTION_REQUIRED",
                        "OTHER",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Nội dung xử lý
                    <textarea
                      name="resolutionNote"
                      required
                      minLength={3}
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                  <button className="button-primary">Hoàn tất hỗ trợ</button>
                </form>
                <form
                  className="portal-form"
                  onSubmit={(event) =>
                    submit(event, "/escalate", "reason", true)
                  }
                >
                  <label className="field-label">
                    Lý do chuyển quản lý
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                  <button className="button-secondary">
                    Chuyển quản lý xem xét
                  </button>
                </form>
              </>
            )}
            {row.status === "ESCALATED" && (
              <p>Đã chuyển cho quản lý xem xét.</p>
            )}
            {row.status === "RESOLVED" && <p>Yêu cầu đã được giải quyết.</p>}
          </>
        )}
        {resource === "rentals" && (
          <p>
            Thông tin kho đang thuê dùng để tác nghiệp. Bàn giao và trả kho được
            thực hiện trong hồ sơ tương ứng.
          </p>
        )}
      </fieldset>
      {busy && <p role="status">Đang lưu thao tác…</p>}
    </section>
  );
}

function InspectionEditor({
  inspection,
  save,
}: {
  inspection: Row;
  save: (input: Row) => Promise<void>;
}) {
  const [result, setResult] = useState(
    inspection.result === "ISSUE_FOUND" ? "ISSUE_FOUND" : "PASS",
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save({
      result,
      ...(result === "ISSUE_FOUND"
        ? {
            issueType: data.get("issueType"),
            issueNote: String(data.get("issueNote") ?? "").trim() || undefined,
          }
        : {}),
      conditionNote:
        String(data.get("conditionNote") ?? "").trim() || undefined,
    });
  };
  return (
    <form className="portal-form portal-inspection-form" onSubmit={submit}>
      <h3>Kiểm tra kho {first(inspection, "unit.unitCode")}</h3>
      <label className="field-label">
        Kết quả kiểm tra
        <select
          aria-label="Kết quả kiểm tra"
          value={result}
          onChange={(event) => setResult(event.target.value)}
        >
          {inspection.result !== "ISSUE_FOUND" && (
            <option value="PASS">Đạt</option>
          )}
          <option value="ISSUE_FOUND">Có vấn đề</option>
        </select>
      </label>
      <label className="field-label">
        Ghi chú hiện trạng
        <textarea
          name="conditionNote"
          defaultValue={first(inspection, "conditionNote")}
          maxLength={2000}
          rows={3}
        />
      </label>
      {result === "ISSUE_FOUND" && (
        <>
          <label className="field-label">
            Loại vấn đề
            <select
              aria-label="Loại vấn đề"
              name="issueType"
              defaultValue={first(inspection, "issueType") || "OTHER"}
            >
              {[
                "NORMAL_WEAR",
                "FACILITY_FAULT",
                "CUSTOMER_DAMAGE",
                "CLEANING_REQUIRED",
                "LOST_KEY_OR_ACCESS_ITEM",
                "OTHER",
              ].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Mô tả vấn đề
            <textarea
              name="issueNote"
              required
              minLength={3}
              defaultValue={first(inspection, "issueNote")}
              maxLength={2000}
              rows={3}
            />
          </label>
        </>
      )}
      <button className="button-secondary">
        Lưu kết quả kho {first(inspection, "unit.unitCode")}
      </button>
    </form>
  );
}
