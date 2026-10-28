import { useRef, useState, type FormEvent } from "react";
import { Modal, RecordPicker } from "../../components/manager/PortalUi";
import { code, first, label, date, customer, type Row } from "../../components/manager/portal-data";
import { mutate } from "../../services/portal";
import { OperationsLink as Link } from '../../components/manager/OperationsLink';
import { useAuth } from '../../auth/auth-context';
export function ManagerCreateDialog({
  resource,
  onClose,
  onSuccess,
  source,
}: {
  resource: string;
  onClose: () => void;
  onSuccess: (created: Row) => void;
  source?: Row;
}) {
  const maintenance = resource === "maintenance";
  const { user } = useAuth();
  const [target, setTarget] = useState(first(source ?? {}, 'contract.id'));
  const [reservationId, setReservationId] = useState(first(source ?? {}, 'reservation.id'));
  const [support, setSupport] = useState(first(source ?? {}, 'id'));
  const [category, setCategory] = useState(
    maintenance ? "UNIT_DAMAGE" : first(source ?? {}, 'category') === 'FACILITY_EQUIPMENT_FAILURE' ? 'FACILITY_EQUIPMENT_FAILURE' : 'UNIT_ISSUE',
  );
  const [priority, setPriority] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (user?.role !== 'STAFF') { setError('Tạo bảo trì và chuyển kho thuộc khu vực nhân viên. Quản lý phân công và theo dõi tiến độ tại mục Phân công nhân viên.'); return; }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const created = await mutate<Row>(
        `/staff/management/${resource}`,
        "POST",
        maintenance
          ? {
              storageUnitId: target,
              category,
              priority,
              description: description.trim(),
            }
          : {
              rentalContractId: target,
              reason: category,
              supportRequestId: support || undefined,
            },
        true,
      );
      onSuccess(created);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể tạo yêu cầu.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={maintenance ? "Tạo yêu cầu bảo trì" : "Tạo yêu cầu chuyển kho"}
      onClose={onClose}
      busy={busy}
    >
      <form className="portal-form" onSubmit={submit}>
        <p>
          {maintenance
            ? "Tạo bảo trì cho kho trống. Kho đang cho khách thuê cần tiếp nhận sự cố và sắp xếp chuyển kho trước; kho đó không nằm trong danh sách kho trống bên dưới."
            : "Chọn hợp đồng đang hoạt động. Chuyển kho chỉ hỗ trợ kho cùng loại."}
        </p>
        {maintenance && <div className="portal-actions"><Link className="button-secondary" to="/manager/operations/rentals">Tra cứu kho đang thuê</Link><Link className="button-secondary" to="/manager/operations/support-requests">Mở yêu cầu sự cố của khách</Link></div>}
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          {source && <div className="transfer-source-summary"><strong>{first(customer(source), 'fullName') || 'Yêu cầu khách hàng'}</strong><p>{first(source, 'subject')} · {code(source)}</p><p>Kho nguồn: {first(source, 'unit.unitCode') || 'Chọn hợp đồng để đối chiếu'} · {first(source, 'reservation.reference')}</p><p>{first(source, 'description')}</p></div>}
          <RecordPicker
            path={
              maintenance
                ? "/manager/units?status=AVAILABLE"
                : "/manager/contracts?status=ACTIVE"
            }
            title={maintenance ? "Kho cần bảo trì" : "Hợp đồng đang thuê"}
            value={target}
            local
            accept={row => maintenance ? !/^(?:appointment|billing|settlement|return|renew|test|manager|overdue|maintenance)-product-[0-9a-f]{8}$/i.test(first(row, 'storageType.id')) && !/^DEMO-(?:SM|MD|LG|LK)-/.test(code(row)) : !source || first(row, 'reservation.id') === first(source, 'reservation.id')}
            onChange={(value, record) => {
              setTarget(value);
              if (!source) setSupport("");
              setReservationId(first(record ?? {}, "reservation.id"));
            }}
            describe={(row) =>
              maintenance ? `${code(row)} · ${first(row, 'storageType.name')} · ${first(row, 'floor')} ${first(row, 'zone')}` : `${first(customer(row), 'fullName') || 'Khách hàng'} · Kho ${first(row, 'storageUnit.unitCode', 'unit.unitCode')} · ${first(row, 'storageType.name')} · ${date(row.startDate)} – ${date(row.endDate)} · ${code(row)}`
            }
          />
          {!maintenance && !source && target && reservationId && (
            <RecordPicker
              path="/manager/support-requests"
              local
              title="Yêu cầu hỗ trợ liên quan (tùy chọn)"
              value={support}
              onChange={setSupport}
              accept={(item) => first(item, "reservation.id") === reservationId}
              describe={(item) => `${code(item)} · ${first(item, "subject")}`}
            />
          )}
          <label className="field-label">
            {maintenance ? "Hạng mục" : "Lý do chuyển"}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {(maintenance
                ? [
                    "UNIT_DAMAGE",
                    "CLEANING",
                    "LOCK_OR_ACCESS",
                    "FACILITY_EQUIPMENT",
                    "OTHER",
                  ]
                : [
                    "UNIT_ISSUE",
                    "FACILITY_EQUIPMENT_FAILURE",
                    "OPERATIONAL_RELOCATION",
                    "OTHER",
                  ]
              ).map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          {maintenance && (
            <>
              <label className="field-label">
                Ưu tiên
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {["LOW", "MEDIUM", "HIGH"].map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Mô tả tình trạng
                <textarea
                  rows={4}
                  required
                  maxLength={4000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </>
          )}
        </fieldset>
        <div className="portal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button
            className="button-primary"
            disabled={busy || !target || (maintenance && !description.trim())}
          >
            {busy ? "Đang tạo…" : "Tạo yêu cầu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
