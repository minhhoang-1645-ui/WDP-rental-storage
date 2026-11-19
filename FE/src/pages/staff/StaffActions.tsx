import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from 'react-router-dom';
import { useAuth } from "../../auth/auth-context";
import { mutate } from "../../services/portal";
import {
  first,
  label,
  object,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import type { StaffResource } from "./staff-resources";
import { handoverCompletionIssue } from '../../utils/handover';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { isTransferRequest } from '../../utils/transfer-request';
import { handoverCustomer, handoverTime, handoverUnits } from './staff-appointment';

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
  onSuccess: (message: string, result?: Row) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const returnRequirementsId = useId();
  const [supportDisposition, setSupportDisposition] = useState('ON_SITE_RESOLVED');
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [escalationDraft, setEscalationDraft] = useState('');
  const [recipientType, setRecipientType] = useState('CUSTOMER');
  const customerName = handoverCustomer(row);
  const handoverContracts = rows(row.allocatedUnits);
  const handoverReadiness = object(row.handoverReadiness);
  const physicalUnits = resource === 'appointments' ? handoverUnits(row) : [];
  const quantity = Number(first(row, 'reservation.quantity'));
  const perUnit = physicalUnits.length > 1 && physicalUnits.every(unit => unit.id)
    && new Set(physicalUnits.map(unit => unit.id)).size === physicalUnits.length;
  const missingUnits = resource === 'appointments' && quantity > 1 && (!perUnit || physicalUnits.length !== quantity);
  const tracksUnits = perUnit && Array.isArray(row.unitHandoverProgress);
  const [savedUnits, setSavedUnits] = useState<Row[]>([]);
  const progress = new Map([...rows(row.unitHandoverProgress), ...savedUnits].map(item => [first(item, 'unitId'), item]));
  const allUnitsRecorded = physicalUnits.every(unit => progress.has(unit.id));
  const root = `/staff/${resource}/${encodeURIComponent(id)}`;
  const assigned = first(row, "assignedStaff.id") === user?.id;
  async function recordPhysicalUnit(form: HTMLFormElement | null, unitId: string) {
    if (!form || !assigned || lock.current) return;
    const data = new FormData(form);
    const condition = String(data.get(`condition-${unitId}`) ?? '').trim();
    if (condition.length < 3 || data.get(`checked-${unitId}`) !== 'on') {
      setError('Nhập hiện trạng và xác nhận đã đối chiếu người nhận, kiểm tra và giao kho.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await mutate(`${root}/units/${encodeURIComponent(unitId)}/handover`, 'PATCH', {
        condition, inspected: true, identityVerified: true, accessDelivered: true,
      });
      setSavedUnits(rows(result.unitHandoverProgress));
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu kết quả bàn giao kho.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const run = async (
    suffix: string,
    method: "POST" | "PATCH" = "POST",
    input?: Row,
    idempotent = false,
  ) => {
    if (lock.current || user?.role !== "STAFF") return;
    if (resource === 'appointments' && suffix === '/complete-handover') {
      const issue = handoverCompletionIssue(row.scheduledAt, undefined, handoverContracts, typeof handoverReadiness.leadDays === 'number' ? handoverReadiness.leadDays : undefined);
      if (issue) { setError(issue); return; }
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutate(root + suffix, method, input, idempotent);
      onSuccess(suffix === '/complete-handover'
        ? result?.usageStatus === 'WAITING_FOR_RENTAL_START'
          ? 'Đã ghi nhận bàn giao giấy tờ và chìa khóa. Hợp đồng chờ đến ngày bắt đầu thuê.'
          : 'Đã ghi nhận bàn giao giấy tờ và chìa khóa.'
        : 'Đã lưu thao tác thành công.', result);
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
    const input: Row = { [field]: String(data.get(field) ?? "").trim() || undefined };
    if (suffix === '/complete-handover') {
      if (tracksUnits && !allUnitsRecorded) { setError('Cần ghi nhận bàn giao từng kho trước khi hoàn tất lịch.'); return; }
      const unitChecks = perUnit && !tracksUnits ? physicalUnits.map(unit => ({
        unitId: unit.id,
        condition: String(data.get(`condition-${unit.id}`) ?? '').trim(),
        inspected: data.get(`checked-${unit.id}`) === 'on',
      })) : undefined;
      input.handoverReport = {
        recipientType,
        recipientName: recipientType === 'CUSTOMER' ? customerName : String(data.get('recipientName') ?? '').trim(),
        authorizationBasis: recipientType === 'AUTHORIZED' ? String(data.get('authorizationBasis') ?? '').trim() : undefined,
        condition: perUnit ? 'Đã ghi nhận hiện trạng từng kho.' : String(data.get('condition') ?? '').trim(),
        accessItemCount: Number(data.get('accessItemCount')),
        identityVerified: data.get('identityVerified') === 'on',
        unitInspected: tracksUnits ? allUnitsRecorded : unitChecks ? unitChecks.every(unit => unit.inspected) : data.get('unitInspected') === 'on',
        accessDelivered: data.get('accessDelivered') === 'on',
        documentsDelivered: data.get('documentsDelivered') === 'on',
        ...(unitChecks ? { unitChecks } : {}),
      };
    }
    void run(suffix, 'POST', input, idempotent);
  };
  const inspections = rows(row.inspections);
  const inspecting = ["INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
    String(row.status),
  );
  const returnDebt = row.returnReadiness && typeof row.returnReadiness === 'object' ? row.returnReadiness as Row : undefined;
  const returnPaid = returnDebt?.canReturn === true;
  const allInspected =
    inspections.length > 0 &&
    inspections.every(
      (item) =>
        ["PASS", "ISSUE_FOUND"].includes(String(item.result)) &&
        (item.result !== "ISSUE_FOUND" || first(item, "issueType")),
    );
  const remainingItems = Number(first(row, 'inventory.remainingItemTypes') || 0);
  const pendingMovements = Number(first(row, 'inventory.pendingMovements') || 0);
  const canFinalize = returnPaid && allInspected && remainingItems === 0 && pendingMovements === 0;
  const contractId = inspections.length === 1 ? first(inspections[0], 'contract.id') : '';
  const storageUnitId = inspections.length === 1 ? first(inspections[0], 'unit.id') : '';
  const stockMovementsPath = contractId
    ? `/staff/stock-movements?${new URLSearchParams({ rentalContractId: contractId })}`
    : '/staff/stock-movements';
  const storedItemsPath = storageUnitId
    ? `/staff/stored-items?${new URLSearchParams({ storageUnitId })}`
    : '/staff/stored-items';
  return (
    <section className="manager-section record-action-panel" id={resource === 'appointments' && row.status === 'REQUESTED' ? undefined : 'staff-processing'} tabIndex={-1}>
      <h2>{resource === 'support-requests' ? 'Kết quả hỗ trợ' : resource === 'maintenance' ? 'Kết quả sửa chữa' : resource === 'returns' ? 'Kiểm tra kho trả' : resource === 'appointments' ? 'Bàn giao kho' : 'Xử lý hồ sơ'}</h2>
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      <fieldset className="portal-action-fieldset" disabled={busy}>
        {resource === "appointments" && row.status === "CONFIRMED" && assigned && (
          missingUnits ? <p role="status">Chưa đủ thông tin các kho đã phân bổ. Hãy làm mới hồ sơ.</p> : (
            <form
              className="portal-form"
              onSubmit={(event) => submit(event, "/complete-handover", "note")}
            >
              <label className="field-label">Người nhận bàn giao<select value={recipientType} onChange={event => setRecipientType(event.target.value)}><option value="CUSTOMER">Khách đứng tên hợp đồng</option><option value="AUTHORIZED">Người được ủy quyền</option></select></label>
              {recipientType === 'CUSTOMER' ? <label className="field-label">Người nhận kho<input name="recipientName" value={customerName} readOnly required /></label> : <><label className="field-label">Tên người được ủy quyền<input name="recipientName" required minLength={2} maxLength={120} /></label><label className="field-label">Căn cứ ủy quyền<textarea name="authorizationBasis" required minLength={3} maxLength={500} placeholder="Thông tin giấy ủy quyền hoặc xác nhận của khách đã được đối chiếu tại cơ sở" /></label></>}
              {perUnit ? <div className="staff-handover-unit-checks">
                {physicalUnits.map(unit => <fieldset key={unit.id} className="staff-handover-unit-check">
                  <legend>{unit.code}</legend>
                  {tracksUnits && progress.has(unit.id) ? <>
                    <p><strong>Đã bàn giao</strong> · {handoverTime(progress.get(unit.id)?.completedAt)}</p>
                    <p>{first(progress.get(unit.id) ?? {}, 'condition')}</p>
                  </> : <>
                    <label className="field-label">Hiện trạng<textarea name={`condition-${unit.id}`} aria-label={`Hiện trạng kho ${unit.code}`} required minLength={3} maxLength={500} rows={2} /></label>
                    <label className="portal-checkbox"><input name={`checked-${unit.id}`} type="checkbox" aria-label={tracksUnits ? `Xác nhận bàn giao kho ${unit.code}` : `Đã kiểm tra kho ${unit.code}`} required />
                      {tracksUnits ? 'Đã đối chiếu người nhận, kiểm tra và giao quyền truy cập kho' : 'Đã kiểm tra kho'}</label>
                    {tracksUnits && <button type="button" className="button-secondary" onClick={event => void recordPhysicalUnit(event.currentTarget.form, unit.id)}>Ghi nhận bàn giao {unit.code}</button>}
                  </>}
                </fieldset>)}
              </div> : <label className="field-label">Hiện trạng cửa, khóa, tường, sàn và thiết bị<textarea name="condition" required minLength={3} maxLength={500} rows={3} /></label>}
              <label className="field-label">Số chìa khóa/thẻ đã giao<input name="accessItemCount" type="number" min={0} max={50} step={1} required /></label>
              <label className="portal-checkbox"><input name="identityVerified" type="checkbox" required />Đã đối chiếu người nhận kho</label>
              {!perUnit && <label className="portal-checkbox"><input name="unitInspected" type="checkbox" required />Đã kiểm tra đúng mã kho và hiện trạng từng kho</label>}
              <label className="portal-checkbox"><input name="accessDelivered" type="checkbox" required />Đã bàn giao chìa khóa/thẻ hoặc hướng dẫn truy cập</label>
              <label className="portal-checkbox"><input name="documentsDelivered" type="checkbox" required />Đã giao giấy tờ bàn giao cho khách</label>
              <label className="field-label">
                Ghi chú bàn giao
                <textarea name="note" maxLength={1000} rows={3} />
              </label>
              {tracksUnits && !allUnitsRecorded && <p role="status">Đã ghi nhận {physicalUnits.filter(unit => progress.has(unit.id)).length}/{physicalUnits.length} kho.</p>}
              <button type="submit" className="button-primary" disabled={tracksUnits && !allUnitsRecorded}>Xác nhận đã bàn giao giấy tờ và chìa khóa</button>
            </form>
          ))}
        {resource === "returns" && (
          <>
            {!['PENDING_SETTLEMENT', 'COMPLETED'].includes(String(row.status)) && <div className="customer-inline-notice" role="status"><strong>Phải thanh toán đủ trước khi nhận lại kho</strong><p>{returnPaid ? 'Khách đã trả đủ các hóa đơn hiện có.' : returnDebt ? 'Khách cần thanh toán đủ trước khi hoàn tất nhận kho trả.' : 'Chưa xác định được tình trạng thanh toán. Hãy làm mới hồ sơ để kiểm tra.'}</p></div>}
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
                    if (canFinalize) void run("/finalize");
                  }}
                >
                  {!canFinalize && (
                    <div id={returnRequirementsId} className="booking-alert is-warning return-requirements" role="status">
                      <strong>Chưa thể xác nhận nhận kho trả</strong>
                      <ul>
                        {!returnPaid && <li>Cần xác nhận khách đã thanh toán đủ các hóa đơn liên quan đến kho trả.</li>}
                        {!allInspected && <li>Bấm “Lưu kết quả kho” cho từng kho chưa lưu kết quả kiểm tra.</li>}
                        {remainingItems > 0 && <li>Còn {remainingItems} loại hàng trong kho. Khách cần gửi yêu cầu lấy hàng và nhân viên cần hoàn tất phiếu xuất.</li>}
                        {pendingMovements > 0 && <li>Còn {pendingMovements} phiếu nhập hoặc xuất chưa hoàn tất.</li>}
                      </ul>
                      {(remainingItems > 0 || pendingMovements > 0) && <div className="portal-actions">
                        {remainingItems > 0 && <Link className="button-secondary" to={storedItemsPath}>Xem hàng đang lưu</Link>}
                        {pendingMovements > 0 && <Link className="button-secondary" to={stockMovementsPath}>Mở phiếu nhập – xuất</Link>}
                      </div>}
                    </div>
                  )}
                  <label className="portal-checkbox">
                    <input type="checkbox" required disabled={!canFinalize}
                      aria-describedby={!canFinalize ? returnRequirementsId : undefined} />
                    Đã nhận lại kho trong hồ sơ và ghi đủ kết quả kiểm tra
                  </label>
                  <button type="submit" className="button-primary" disabled={!canFinalize}
                    aria-describedby={!canFinalize ? returnRequirementsId : undefined}>
                    Hoàn tất nhận kho trả
                  </button>
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
                  Nội dung kiểm tra hoặc sửa chữa
                  <textarea
                    name="workNote"
                    required
                    minLength={3}
                    maxLength={4000}
                    rows={4}
                  />
                </label>
                <button className="button-primary">
                  Gửi kết quả nghiệm thu
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
        {resource === 'support-requests' && isEarlyReturnRequest(row) && <p>Đang chờ quản lý duyệt thời điểm trả sớm. Nhân viên tiếp nhận khi khách đã được duyệt và gửi yêu cầu trả kho.</p>}
        {resource === "support-requests" && !isEarlyReturnRequest(row) && !isTransferRequest(row) && (
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
            {assigned && row.status === 'IN_PROGRESS' && (
              <form className="portal-form" onSubmit={event => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const note = String(data.get('supportNote') ?? '').trim();
                if (note.length < 3) { setError('Vui lòng nhập ít nhất 3 ký tự.'); return; }
                if (supportDisposition === 'escalate') void run('/escalate', 'POST', { reason: note }, true);
                else void run('/resolve', 'POST', { resolutionType: supportDisposition, resolutionNote: note }, true);
              }}>
                <label className="field-label">Hướng xử lý
                  <select value={supportDisposition} onChange={event => { setSupportDisposition(event.target.value); setError(''); }} required>
                    <option value="">Chọn hướng xử lý</option>
                    {['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'PAYMENT_GUIDANCE', 'NO_ACTION_REQUIRED', 'OTHER'].map(value =>
                      <option key={value} value={value}>{label(value)}</option>)}
                    <option value="escalate">Cần quản lý xem xét</option>
                  </select>
                </label>
                <label className="field-label">
                  {supportDisposition === 'escalate' ? 'Lý do chuyển quản lý' : 'Mô tả kết quả xử lý'}
                  <textarea name="supportNote" required minLength={3} maxLength={4000} rows={3}
                    value={supportDisposition === 'escalate' ? escalationDraft : resolutionDraft}
                    onChange={event => (supportDisposition === 'escalate' ? setEscalationDraft : setResolutionDraft)(event.target.value)} />
                </label>
                <button className="button-primary" disabled={busy || !supportDisposition}>
                  {busy ? 'Đang lưu…' : supportDisposition === 'escalate' ? 'Chuyển quản lý xem xét' : 'Hoàn tất hỗ trợ'}
                </button>
              </form>
            )}
            {row.status === "ESCALATED" && (
              <p>Đã chuyển đến bộ phận phụ trách xem xét.</p>
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
      {inspection.result === "PENDING" && <small>Chưa lưu kết quả kiểm tra</small>}
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
