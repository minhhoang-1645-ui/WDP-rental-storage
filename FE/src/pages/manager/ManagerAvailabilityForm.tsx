import { DatePicker } from '../../components/workspace/DateTimeFields';
import { useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../services/api";
import { date, first, type Row } from "../../components/manager/portal-data";
import { Facts } from "../../components/manager/PortalUi";
import { vietnamCalendarDate, wholeRentalMonths } from "../../utils/business-date";

export function ManagerAvailabilityForm({ products }: { products: Row[] }) {
  const [result, setResult] = useState<Row>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState('');
  const lock = useRef(false);
  const today = vietnamCalendarDate();
  const earliestEnd = start && start >= today ? new Date(Date.parse(start) + 86_400_000).toISOString().slice(0, 10) : today;
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
    const durationMonths = wholeRentalMonths(startDate, endDate);
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
            periodMode: durationMonths ? "duration" : "dates",
            ...(durationMonths ? { durationMonths } : {}),
            quantity: Number(form.get("quantity")),
            adjacencyPreference: false,
            addonIds: [],
            paymentChoice: "pay-later",
            paymentPlan: durationMonths ? "PAY_MONTHLY" : "PREPAID",
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
        data-wdp-draft="ignore"
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
          <DatePicker label="Ngày bắt đầu kiểm tra" name="startDate" min={today} required value={start}
            onChange={value => { setStart(value); setResult(undefined); setError(''); }} />
          <DatePicker label="Ngày kết thúc kiểm tra" name="endDate" min={earliestEnd} required
            onChange={() => { setResult(undefined); setError(''); }} />
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
