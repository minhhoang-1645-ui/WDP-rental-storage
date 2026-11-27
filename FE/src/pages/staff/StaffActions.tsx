import { StaffTaskException } from './StaffTaskException';
import { DatePicker } from '../../components/workspace/DateTimeFields';
import { vietnamCalendarDate } from '../../utils/business-date';
import { useId, useRef, useState, type FormEvent } from "react";
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
import { useConfirmation } from '../../components/workspace/ConfirmationProvider';
import { ApiError } from '../../services/api';

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];

function readHandoverPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được ảnh bàn giao.'));
    reader.onerror = () => reject(new Error('Không đọc được ảnh bàn giao.'));
    reader.readAsDataURL(file);
  });
}

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
  const confirm = useConfirmation();
  const [pendingAction, setPendingAction] = useState<string>(),
    [error, setError] = useState("");
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [handoverPhotos, setHandoverPhotos] = useState<{ id: number; name: string; src: string }[]>([]);
  const [photoError, setPhotoError] = useState('');
  const nextPhotoId = useRef(0);
  const photoReadLock = useRef(false);

  async function addHandoverPhotos(files: File[]) {
    if (!files.length || photoReadLock.current || pendingAction !== undefined) return;
    if (handoverPhotos.length + files.length > 3) {
      setPhotoError('Chỉ được đính kèm tối đa 3 ảnh. Bỏ ảnh đã chọn để thêm ảnh khác.');
      return;
    }
    if (files.some(file => !photoTypes.includes(file.type) || file.size === 0 || file.size > 400 * 1024)) {
      setPhotoError('Chọn ảnh JPG, PNG hoặc WebP tối đa 400 KB mỗi ảnh.');
      return;
    }
    photoReadLock.current = true;
    setReadingPhotos(true);
    setPhotoError('');
    try {
      const additions = await Promise.all(files.map(async file => ({
        id: nextPhotoId.current++, name: file.name, src: await readHandoverPhoto(file),
      })));
      setHandoverPhotos(previous => [...previous, ...additions]);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Không đọc được ảnh bàn giao.');
    } finally {
      photoReadLock.current = false;
      setReadingPhotos(false);
    }
  }
  const busy = pendingAction !== undefined || readingPhotos;
  const lock = useRef(false);
  const returnRequirementsId = useId();
  const [supportDisposition, setSupportDisposition] = useState('ON_SITE_RESOLVED');
  const supportOption = row.category === 'PAYMENT_SUPPORT' ? 'escalate' : supportDisposition;
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
  const assigned = Boolean(user && first(row, 'assignedStaff.id') === user.id && first(row, 'assignedStaff.accountStatus') !== 'DISABLED');
  function reportFailure(caught: unknown, fallback: string) {
    const denied = caught instanceof ApiError && [403, 404].includes(caught.status);
    setError(denied ? 'Hồ sơ không còn truy cập được. Đang kiểm tra lại phân công và quyền cơ sở.'
      : caught instanceof Error ? caught.message : fallback);
    if (denied || caught instanceof ApiError && caught.status === 409) refresh();
  }
  async function recordPhysicalUnit(form: HTMLFormElement | null, unitId: string) {
    if (!form || !assigned || lock.current) return;
    const data = new FormData(form);
    const condition = String(data.get(`condition-${unitId}`) ?? '').trim();
    if (condition.length < 3 || data.get(`checked-${unitId}`) !== 'on') {
      setError('Nhập hiện trạng và xác nhận đã đối chiếu người nhận, kiểm tra và giao kho.');
      return;
    }
    lock.current = true;
    setPendingAction(unitId);
    setError('');
    try {
      const result = await mutate(`${root}/units/${encodeURIComponent(unitId)}/handover`, 'PATCH', {
        condition, inspected: true, identityVerified: true, accessDelivered: true,
      });
      setSavedUnits(rows(result.unitHandoverProgress));
      refresh();
    } catch (caught) {
      reportFailure(caught, 'Không thể lưu kết quả bàn giao kho.');
    } finally {
      lock.current = false;
      setPendingAction(undefined);
    }
  }
  const run = async (
    suffix: string,
    method: "POST" | "PATCH" = "POST",
    input?: Row,
    idempotent = false,
  ) => {
    if (lock.current || user?.role !== 'FACILITY_STAFF' || !assigned) return;
    if (resource === 'appointments' && suffix === '/complete-handover') {
      const issue = handoverCompletionIssue(row.scheduledAt, undefined, handoverContracts, typeof handoverReadiness.leadDays === 'number' ? handoverReadiness.leadDays : undefined);
      if (issue) { setError(issue); return; }
    }
    lock.current = true;
    setPendingAction(suffix);
    setError("");
    try {
      if (suffix === '/complete-handover' && !await confirm({
        title: 'Hoàn tất bàn giao?',
        description: 'Xác nhận đã giao kho, quyền truy cập và giấy tờ cho người nhận ghi trên biên bản.',
        confirmLabel: 'Hoàn tất bàn giao',
      })) return;
      if (suffix === '/finalize' && !await confirm({
        title: 'Hoàn tất nhận kho trả?',
        description: 'Hệ thống sẽ ghi nhận việc nhận kho thực tế theo kết quả kiểm tra đã lưu.',
        confirmLabel: 'Xác nhận nhận kho',
      })) return;
      const result = await mutate(root + suffix, method, input, idempotent);
      onSuccess(suffix === '/complete-handover'
        ? result?.usageStatus === 'WAITING_FOR_RENTAL_START'
          ? 'Đã ghi nhận bàn giao giấy tờ và chìa khóa. Hợp đồng chờ đến ngày bắt đầu thuê.'
          : 'Đã ghi nhận bàn giao giấy tờ và chìa khóa.'
        : 'Đã lưu thao tác thành công.', result);
      refresh();
    } catch (caught) {
      reportFailure(caught, 'Không thể thực hiện thao tác.');
    } finally {
      lock.current = false;
      setPendingAction(undefined);
    }
  };
  const submit = (
    event: FormEvent<HTMLFormElement>,
    suffix: string,
    field: string,
    idempotent = false,
  ) => {
    event.preventDefault();
    if (busy || photoReadLock.current || lock.current) return;
    const data = new FormData(event.currentTarget);
    const input: Row = { [field]: String(data.get(field) ?? "").trim() || undefined };
    if (suffix === '/complete-work') input.evidenceLink = String(data.get('evidenceLink') ?? '').trim() || undefined;
    if (suffix === '/complete-handover') {
      const deliveredPurchaseIds = data.getAll('deliveredPurchaseIds').map(String);
      if (deliveredPurchaseIds.length) input.deliveredPurchaseIds = deliveredPurchaseIds;
      if (tracksUnits && !allUnitsRecorded) { setError('Cần ghi nhận bàn giao từng kho trước khi hoàn tất lịch.'); return; }
      const unitChecks = perUnit && !tracksUnits ? physicalUnits.map(unit => ({
        unitId: unit.id,
        condition: String(data.get(`condition-${unit.id}`) ?? '').trim(),
        inspected: data.get(`checked-${unit.id}`) === 'on',
      })) : undefined;
      const photoLinks = String(data.get('handoverPhotoLinks') ?? '').split(/\r?\n/).map(link => link.trim()).filter(Boolean);
      if (photoLinks.length > 3 || photoLinks.some(link => !/^https:\/\/[^\s]+$/i.test(link) || link.length > 2000)) {
        setError('Nhập tối đa 3 link HTTPS, mỗi link trên một dòng.');
        return;
      }
      const photos = handoverPhotos.map(photo => photo.src);
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
        ...(photos.length ? { photos } : {}),
        ...(photoLinks.length ? { photoLinks } : {}),
      };
    }
    void run(suffix, 'POST', input, idempotent);
  };
  const photoPicker = <div className="staff-handover-photo-picker">
                <label className="field-label">{resource === 'appointments' ? 'Ảnh bàn giao từ máy (tùy chọn)' : 'Ảnh kết quả hỗ trợ (tùy chọn)'}
                  <input type="file" accept={photoTypes.join(',')} multiple disabled={busy || handoverPhotos.length === 3}
                    onChange={event => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = '';
                      void addHandoverPhotos(files);
                    }} />
                  <small>JPG, PNG hoặc WebP, tối đa 400 KB mỗi ảnh. Có thể chọn từng ảnh hoặc chọn nhiều ảnh cùng lúc.</small>
                </label>
                <p role="status">{readingPhotos ? 'Đang đọc ảnh…' : `Đã chọn ${handoverPhotos.length}/3 ảnh`}</p>
                {photoError && <p className="booking-alert is-error" role="alert">{photoError}</p>}
                {handoverPhotos.length > 0 && <ul className="staff-handover-photos staff-handover-photo-preview" aria-label={resource === 'appointments' ? 'Ảnh bàn giao đã chọn' : 'Ảnh hỗ trợ đã chọn'}>
                  {handoverPhotos.map(photo => <li key={photo.id}>
                    <img src={photo.src} alt={photo.name} />
                    <span>{photo.name}</span>
                    <button type="button" className="button-secondary" disabled={busy} aria-label={'Bỏ ảnh ' + photo.name} onClick={() => {
                      setHandoverPhotos(previous => previous.filter(item => item.id !== photo.id));
                      setPhotoError('');
                    }}>Bỏ ảnh</button>
                  </li>)}
                </ul>}
              </div>;
  const inspections = rows(row.inspections);
  const inspecting = ["INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
    String(row.status),
  );
  const returnDebt = row.returnReadiness && typeof row.returnReadiness === 'object' ? row.returnReadiness as Row : undefined;
  const returnPaid = returnDebt?.canReturn === true;
  const returnBlocks = Array.isArray(returnDebt?.blockingReasons)
    ? returnDebt.blockingReasons.filter((reason): reason is string => typeof reason === 'string') : [];
  const allInspected =
    inspections.length > 0 &&
    inspections.every(
      (item) =>
        ["PASS", "ISSUE_FOUND"].includes(String(item.result)) &&
        (item.result !== "ISSUE_FOUND" || first(item, "issueType")),
    );
  const canFinalize = returnPaid && allInspected;
  const returnCanEscalate = resource === 'returns' && assigned && !row.physicallyReturnedAt &&
    ['REQUESTED', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND'].includes(String(row.status));
  if (returnCanEscalate && row.waitingForManager === true) {
    return <StaffTaskException kind="returns" id={first(row, 'id')} waiting refresh={refresh} />;
  }
  return (
    <section className="manager-section record-action-panel" id={resource === 'appointments' && row.status === 'REQUESTED' ? undefined : 'staff-processing'} tabIndex={-1}>
      <h2>{resource === 'support-requests' ? 'Kết quả hỗ trợ' : resource === 'maintenance' ? 'Kết quả sửa chữa' : resource === 'returns' ? 'Kiểm tra kho trả' : resource === 'appointments' ? 'Bàn giao kho' : 'Xử lý hồ sơ'}</h2>
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      {returnCanEscalate && <StaffTaskException kind="returns" id={first(row, 'id')} waiting={false} refresh={refresh} />}
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
              <PurchasedProducts row={row} confirm />
              {photoPicker}
              <label className="field-label">Link ảnh bàn giao (tùy chọn)
                <textarea name="handoverPhotoLinks" rows={2} maxLength={6002} placeholder="https://..." disabled={busy} />
                <small>Tối đa 3 link HTTPS, mỗi link một dòng.</small>
              </label>
              <label className="field-label">
                Ghi chú bàn giao
                <textarea name="note" maxLength={1000} rows={3} />
              </label>
              {tracksUnits && !allUnitsRecorded && <p role="status">Đã ghi nhận {physicalUnits.filter(unit => progress.has(unit.id)).length}/{physicalUnits.length} kho.</p>}
              <button type="submit" className="button-primary" disabled={busy || tracksUnits && !allUnitsRecorded} aria-busy={busy || pendingAction === '/complete-handover'}>
                {pendingAction === '/complete-handover' ? 'Đang ghi nhận bàn giao…' : 'Xác nhận đã bàn giao giấy tờ và chìa khóa'}
              </button>
            </form>
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
                    const checks = new FormData(event.currentTarget);
                    if (canFinalize && checks.get('unitsEmpty') === 'on' && checks.get('accessRevoked') === 'on') {
                      void run('/finalize', 'POST', { unitsEmpty: true, accessRevoked: true, servicesReturned: checks.get('servicesReturned') === 'on',
                        physicalReturnDate: checks.get('physicalReturnDate') ?? undefined, physicalReturnEvidence: checks.get('physicalReturnEvidence') ?? undefined });
                    }
                  }}
                >
                  {!canFinalize && (
                    <div id={returnRequirementsId} className="booking-alert is-warning return-requirements" role="status">
                      <strong>Chưa thể xác nhận nhận kho trả</strong>
                      <ul>
                        {!returnPaid && (returnBlocks.length
                          ? returnBlocks.map(reason => <li key={reason}>{reason}</li>)
                          : <li>{returnDebt?.facilityFaultReviewRequired ? 'Chờ quản lý xác minh lỗi cơ sở.'
                            : returnDebt ? 'Hồ sơ chưa đủ điều kiện nhận kho. Liên hệ quản lý để kiểm tra.' : 'Làm mới hồ sơ để kiểm tra điều kiện nhận kho.'}</li>)}
                        {!allInspected && <li>Bấm “Lưu kết quả kho” cho từng kho chưa lưu kết quả kiểm tra.</li>}
                      </ul>
                    </div>
                  )}
                  <label className="portal-checkbox">
                    <input name="unitsEmpty" type="checkbox" required disabled={!canFinalize}
                      aria-describedby={!canFinalize ? returnRequirementsId : undefined} />
                    Đã kiểm tra thực tế và xác nhận tất cả kho trong hồ sơ đã trống
                  </label>
                  <label className="portal-checkbox"><input name="accessRevoked" type="checkbox" required disabled={!canFinalize} />
                    Đã thu hồi chìa khóa, thẻ hoặc quyền truy cập kho</label>
                  {row.servicesConfirmationRequired === true && <label className="portal-checkbox"><input name="servicesReturned" type="checkbox" required disabled={!canFinalize} /> Đã thu hồi thiết bị thuê và đối chiếu sản phẩm chưa bàn giao</label>}
                  {row.overdueReturnDateRequired === true && <>
                    <DatePicker label="Ngày nhận kho thực tế" name="physicalReturnDate" max={vietnamCalendarDate()} required />
                    <label>Căn cứ nếu nhận kho vào ngày trước<input name="physicalReturnEvidence" maxLength={500} /></label>
                  </>}
                  <button type="submit" className="button-primary" disabled={!canFinalize}
                    aria-describedby={!canFinalize ? returnRequirementsId : undefined}>
                    Hoàn tất nhận kho trả
                  </button>
                </form>
              </>
            )}
            {!inspecting && row.status !== "REQUESTED" && (
              <p>
                Đã nhận kho trả. Quản lý sẽ theo dõi quyết toán.
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
                <label className="field-label">Liên kết ảnh kết quả (tùy chọn)
                  <input name="evidenceLink" type="url" pattern="https://.+" maxLength={1000} placeholder="https://…" />
                </label>
                <button className="button-primary">
                  Gửi kết quả nghiệm thu
                </button>
              </form>
            )}
            {row.status === "AWAITING_VERIFICATION" && (
              <p>Đang chờ quản lý nghiệm thu.</p>
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
            {assigned && row.status === 'IN_PROGRESS' && row.customerWaitReason && <div className="portal-form">
              <p>Chờ khách phản hồi · {String(row.customerWaitReason)}</p>
              <button className="button-primary" disabled={busy} onClick={() => void run('/resume', 'POST', undefined, true)}>Tiếp tục xử lý</button>
            </div>}
            {assigned && row.status === 'IN_PROGRESS' && !row.customerWaitReason && (
              <form className="portal-form" onSubmit={event => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                if (busy || photoReadLock.current) return;
                const note = String(data.get('supportNote') ?? '').trim();
                if (note.length < 3) { setError('Vui lòng nhập ít nhất 3 ký tự.'); return; }
                if (supportOption === 'wait-customer') void run('/wait-customer', 'POST', { reason: note }, true);
                else if (supportOption === 'escalate') void run('/escalate', 'POST', { reason: note }, true);
                else void run('/resolve', 'POST', { resolutionType: supportOption, resolutionNote: note, resolutionPhotos: handoverPhotos.map(photo => photo.src), identityVerified: data.get('identityVerified') === 'on' }, true);
              }}>
                <label className="field-label">Hướng xử lý
                  <select value={supportOption} onChange={event => { setSupportDisposition(event.target.value); setError(''); }} required>
                    <option value="">Chọn hướng xử lý</option>
                    {row.category !== 'PAYMENT_SUPPORT' && ['ON_SITE_RESOLVED', 'CUSTOMER_GUIDANCE', 'ACCESS_RESTORED', 'NO_ACTION_REQUIRED', 'OTHER'].map(value =>
                      <option key={value} value={value}>{label(value)}</option>)}
                    <option value="escalate">Cần quản lý xem xét</option>
                    <option value="wait-customer">Chờ khách phản hồi</option>
                  </select>
                </label>
                <label className="field-label">
                  {supportOption === 'wait-customer' ? 'Lý do chờ khách' : supportOption === 'escalate' ? 'Lý do chuyển quản lý' : 'Mô tả kết quả xử lý'}
                  <textarea name="supportNote" required minLength={3} maxLength={supportOption === 'wait-customer' ? 1000 : 4000} rows={3}
                    value={supportOption === 'escalate' ? escalationDraft : resolutionDraft}
                    onChange={event => (supportOption === 'escalate' ? setEscalationDraft : setResolutionDraft)(event.target.value)} />
                </label>
                {(supportOption === 'ACCESS_RESTORED' || supportOption === 'ON_SITE_RESOLVED' && ['LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE'].includes(String(row.category))) &&
                  <label className="portal-checkbox"><input name="identityVerified" type="checkbox" required />Đã đối chiếu danh tính khách và quyền truy cập kho</label>}
                {supportOption && !['wait-customer', 'escalate'].includes(supportOption) && photoPicker}
                <button className="button-primary" disabled={busy || !supportOption}>
                  {busy ? 'Đang lưu…' : supportOption === 'wait-customer' ? 'Ghi nhận chờ khách' : supportOption === 'escalate' ? 'Chuyển quản lý xem xét' : 'Hoàn tất hỗ trợ'}
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
      evidenceLink: String(data.get('evidenceLink') ?? '').trim() || undefined,
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
      <label className="field-label">Liên kết ảnh kiểm tra (tùy chọn)
        <input name="evidenceLink" type="url" pattern="https://.+" maxLength={1000} placeholder="https://…" />
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

export function PurchasedProducts({ row, confirm }: { row: Row; confirm: boolean }) {
  const products = rows(row.purchasedProducts);
  if (!products.length) return null;
  return <fieldset>
    <legend>Sản phẩm bàn giao cho khách</legend>
    {products.map(product => {
      const id = first(product, 'id');
      const description = [first(product, 'name'), [product.quantity, first(product, 'physicalUnit')].filter(Boolean).join(' ')].join(' · ');
      const status = first(product, 'fulfillmentStatus');
      const statusText = status === 'FULFILLED' ? 'Đã bàn giao' : status === 'RESERVED' ? 'Chờ bàn giao'
        : status === 'RELEASED' ? 'Đã giải phóng số lượng giữ' : 'Chưa ghi nhận';
      return confirm && status === 'RESERVED' ?
        <label className="portal-checkbox" key={id}><input type="checkbox" name="deliveredPurchaseIds" value={id} />
          {description} · {statusText}</label> :
        <p key={id}>{description} · {statusText}</p>;
    })}
    {confirm && products.some(product => product.fulfillmentStatus === 'RESERVED') &&
      <small>Chỉ chọn sản phẩm đã giao đủ số lượng. Mục chưa giao vẫn được giữ cho khách.</small>}
  </fieldset>;
}
