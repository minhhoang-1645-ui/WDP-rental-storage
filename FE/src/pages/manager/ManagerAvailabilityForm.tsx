import { useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../services/api";
import { date, first, type Row } from "../../components/manager/portal-data";
import { Facts } from "../../components/manager/PortalUi";

export function ManagerAvailabilityForm({ products }: { products: Row[] }) {
  const [result, setResult] = useState<Row>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate")),
      endDate = String(form.get("endDate"));
    setResult(undefined);
    setError("");
    if (endDate <= startDate) {
      setError("Ngày kết thúc phải sau ngày bắt đầu.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      setResult(
        await apiRequest<Row>("/booking/availability", {
          method: "POST",
          body: JSON.stringify({
            productId: form.get("productId"),
            startDate,
            endDate,
            periodMode: "dates",
            quantity: Number(form.get("quantity")),
            adjacencyPreference: false,
            addonIds: [],
            paymentChoice: "pay-later",
            paymentPlan: "PAY_MONTHLY",
          }),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể kiểm tra khả dụng.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="manager-section">
      <h2>Kiểm tra kho trống theo kỳ thuê</h2>
      <p>
        Kiểm tra đủ kho cho toàn bộ khoảng thuê. Ngày kết thúc không thuộc kỳ
        thuê; kết quả chưa giữ hoặc phân bổ kho.
      </p>
      <form
        className="portal-form"
        onSubmit={submit}
        onChange={() => {
          setResult(undefined);
          setError("");
        }}
      >
        <fieldset disabled={busy}>
          <label className="field-label">
            Loại kho cần kiểm tra
            <select name="productId" required>
              {products.map((row) => (
                <option key={first(row, "id")} value={first(row, "id")}>
                  {first(row, "name")}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Ngày bắt đầu kiểm tra
            <input name="startDate" type="date" min={today} required />
          </label>
          <label className="field-label">
            Ngày kết thúc kiểm tra
            <input name="endDate" type="date" min={today} required />
          </label>
          <label className="field-label">
            Số kho cần kiểm tra
            <input
              name="quantity"
              type="number"
              min={1}
              max={3}
              step={1}
              defaultValue={1}
              required
            />
          </label>
        </fieldset>
        <button className="button-primary" disabled={busy}>
          {busy ? "Đang kiểm tra…" : "Kiểm tra khả dụng"}
        </button>
      </form>
      {error && (
        <div className="booking-alert is-error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div role="status">
          <h3>
            {result.available === true
              ? "Còn kho phù hợp cho toàn kỳ"
              : "Không đủ kho phù hợp cho toàn kỳ"}
          </h3>
          <p>{first(result, "message")}</p>
          <Facts
            items={[
              ["Từ ngày", date(result.startDate)],
              ["Đến trước ngày", date(result.endDateExclusive)],
            ]}
          />
        </div>
      )}
    </section>
  );
}
