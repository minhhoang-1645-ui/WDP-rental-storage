import { useRef, useState, type FormEvent } from "react";
import { Modal, RecordPicker } from "../../components/manager/PortalUi";
import { code, first, label } from "../../components/manager/portal-data";
import { mutate } from "../../services/portal";
export function ManagerCreateDialog({
  resource,
  onClose,
  onSuccess,
}: {
  resource: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const maintenance = resource === "maintenance";
  const [target, setTarget] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [support, setSupport] = useState("");
  const [category, setCategory] = useState(
    maintenance ? "UNIT_DAMAGE" : "UNIT_ISSUE",
  );
  const [priority, setPriority] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/manager/${resource}`,
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
      onSuccess();
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
            ? "Chọn kho sẵn sàng để đưa vào bảo trì."
            : "Chọn hợp đồng đang hoạt động. Chuyển kho chỉ hỗ trợ kho cùng loại."}
        </p>
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          <RecordPicker
            path={
              maintenance
                ? "/manager/units?status=AVAILABLE"
                : "/manager/contracts?status=ACTIVE"
            }
            title={maintenance ? "Kho cần bảo trì" : "Hợp đồng đang thuê"}
            value={target}
            onChange={(value, record) => {
              setTarget(value);
              setSupport("");
              setReservationId(first(record ?? {}, "reservation.id"));
            }}
            describe={(row) =>
              `${code(row)} · ${first(row, "storageType.name", "reservation.customer.fullName")}`
            }
          />
          {!maintenance && target && reservationId && (
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
