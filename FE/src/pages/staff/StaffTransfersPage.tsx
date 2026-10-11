import { useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { mutate } from "../../services/portal";
import { PageHeader } from "../../components/manager/PortalUi";

export function StaffTransfersPage() {
  const { id = "" } = useParams();
  return <StaffTransferForm key={id} id={id} />;
}

function StaffTransferForm({ id }: { id: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ error: boolean; text: string }>();
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget,
      values = new FormData(form),
      transferId = String(values.get("transferId")).trim();
    lock.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await mutate(
        `/staff/transfers/${encodeURIComponent(transferId)}/complete`,
        "POST",
      );
      setMessage({
        error: false,
        text: "Đã ghi nhận hoàn tất chuyển kho thực tế.",
      });
      form.reset();
    } catch (error) {
      setMessage({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "Không thể hoàn tất chuyển kho.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section>
      <PageHeader
        title="Chuyển kho thực tế"
        description="Hoàn tất lệnh chuyển kho đã được quản lý phê duyệt."
      />
      <section className="manager-section">
        <h2>Xác nhận hoàn tất chuyển kho</h2>
        <p>
          Nhập mã lệnh chuyển do quản lý cung cấp sau khi đã chuyển hàng và bàn
          giao kho đích thực tế. Hệ thống chỉ chấp nhận lệnh đã được duyệt.
        </p>
        <form className="portal-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            <label className="field-label">
              Mã lệnh chuyển kho
              <input
                name="transferId"
                required
                maxLength={100}
                defaultValue={id}
                placeholder="Mã hoặc ID lệnh chuyển"
              />
            </label>
            <label className="portal-checkbox">
              <input type="checkbox" required />
              Đã hoàn tất chuyển thực tế từ kho nguồn sang đúng kho đích được
              duyệt
            </label>
          </fieldset>
          <button className="button-primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Hoàn tất chuyển kho"}
          </button>
        </form>
        {message && (
          <div
            className={
              message.error ? "booking-alert is-error" : "portal-success"
            }
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </div>
        )}
        <p>
          Danh sách lệnh chuyển chưa được cấp cho khu vực nhân viên. Quản lý
          cung cấp mã lệnh để thực hiện.
        </p>
      </section>
    </section>
  );
}
