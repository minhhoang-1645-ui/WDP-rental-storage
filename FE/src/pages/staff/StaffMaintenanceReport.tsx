import { useRef, useState, type FormEvent } from "react";
import { mutate } from "../../services/portal";
import { label } from "../../components/manager/portal-data";

export function StaffMaintenanceReport({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget,
      values = new FormData(form);
    lock.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await mutate(
        "/staff/maintenance",
        "POST",
        {
          storageUnitId: String(values.get("storageUnitId")).trim(),
          category: values.get("category"),
          priority: values.get("priority"),
          description: String(values.get("description")).trim(),
        },
        true,
      );
      form.reset();
      setMessage({ error: false, text: "Đã ghi nhận sự cố bảo trì." });
      onSuccess();
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : "Không thể báo sự cố.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="manager-section">
      <h2>Báo sự cố trên kho sẵn sàng</h2>
      <p>
        Nhập mã định danh kho do quản lý cung cấp. Chỉ kho đang sẵn sàng và chưa
        có hồ sơ bảo trì mở mới được nhận báo cáo.
      </p>
      <form className="portal-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="field-label">
            Mã định danh kho
            <input
              name="storageUnitId"
              required
              minLength={3}
              maxLength={100}
              placeholder="ID kho vật lý"
            />
          </label>
          <label className="field-label">
            Loại sự cố
            <select name="category">
              {[
                "UNIT_DAMAGE",
                "CLEANING",
                "LOCK_OR_ACCESS",
                "FACILITY_EQUIPMENT",
                "OTHER",
              ].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Mức ưu tiên
            <select name="priority" defaultValue="MEDIUM">
              {["LOW", "MEDIUM", "HIGH"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Mô tả sự cố
            <textarea
              name="description"
              required
              minLength={3}
              maxLength={4000}
              rows={3}
            />
          </label>
        </fieldset>
        <button className="button-primary" disabled={busy}>
          {busy ? "Đang gửi…" : "Gửi báo cáo sự cố"}
        </button>
      </form>
      {message && (
        <p
          className={
            message.error ? "booking-alert is-error" : "portal-success"
          }
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
