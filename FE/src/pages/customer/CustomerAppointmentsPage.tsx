import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { CustomerFormSources } from "../../components/customer/CustomerFormSources";
import { mutate } from "../../services/portal";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { CalendarClock, CalendarPlus, History, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import { formatPortalDate } from "../../components/customer/CustomerPortalHelpers";
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';
import {
  CustomerStatus,
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
} from "../../components/customer/CustomerPortalUi";
import { ApiError } from "../../services/api";
import { handoverWindow, vietnamLocalMinute } from '../../utils/handover';
import type {
  CustomerAppointment,
  CustomerContract,
} from "../../types/customer";

export function CustomerAppointmentsPage() {
  const { user } = useAuth();
  const appointments = usePaginatedResource<CustomerAppointment>(
    "/customer/appointments?limit=100",
    user?.id ?? "",
    true,
  );
  const contracts = usePaginatedResource<CustomerContract>(
    "/customer/contracts?limit=100",
    user?.id ?? "",
  );
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [reservationId, setReservationId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const earliestAppointment = vietnamLocalMinute(currentTime + 60000);
  const eligibleReservations = useMemo(() => {
    const map = new Map<string, { id: string; reference: string; startDate: string; pickupStart: string; endDate: string }>();
    const groups = new Map<string, CustomerContract[]>();
    for (const contract of contracts.data?.items ?? [])
      groups.set(contract.reservation.id, [
        ...(groups.get(contract.reservation.id) ?? []),
        contract,
      ]);
    const active = new Set(
      (appointments.data?.items ?? [])
        .filter((item) => ["REQUESTED", "CONFIRMED"].includes(item.status))
        .map((item) => item.reservation.id),
    );
    for (const [id, items] of groups) {
      const period = handoverWindow(items);
      if (
        items.length === items[0].reservation.quantity &&
        items.every((item) => item.status === "READY_FOR_HANDOVER") &&
        !active.has(id) && period.start < period.end && `${period.end}T00:00` > vietnamLocalMinute(currentTime)
      )
        map.set(id, {
          id,
          reference: items[0].reservation.reference,
          startDate: period.start,
          pickupStart: period.pickupStart,
          endDate: period.end,
        });
    }
    return [...map.values()];
  }, [contracts.data, appointments.data, currentTime]);
  const selectedReservation = eligibleReservations.find(
    (item) => item.id === reservationId,
  );
  const reservationStartMinimum = selectedReservation
    ? `${selectedReservation.pickupStart}T00:00`
    : earliestAppointment;
  const minimumAppointment =
    earliestAppointment > reservationStartMinimum
      ? earliestAppointment
      : reservationStartMinimum;
  const maximumAppointment = selectedReservation ? vietnamLocalMinute(Date.parse(`${selectedReservation.endDate}T00:00:00+07:00`) - 60000) : undefined;
  const filteredAppointments = (appointments.data?.items ?? []).filter(
    (item) =>
      view === "upcoming"
        ? ['REQUESTED', 'CONFIRMED'].includes(item.status)
        : ["COMPLETED", "CANCELLED"].includes(item.status),
  );

  const { items: visible, pagination } =
    useCustomerPagination(filteredAppointments);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setMessage(null);
    setSubmitting(true);
    try {
      if (!selectedReservation) throw new Error('Chọn yêu cầu đã thanh toán, đủ hợp đồng và còn trong kỳ thuê.');
      const requestedTime = new Date(`${scheduledAt}+07:00`);
      if (
        !Number.isFinite(requestedTime.getTime()) ||
        requestedTime.getTime() <= Date.now()
      )
        throw new Error("Lịch hẹn phải ở thời điểm tương lai.");
      if (
        selectedReservation &&
        scheduledAt.slice(0, 10) < selectedReservation.pickupStart
      )
        throw new Error("Lịch nhận chìa khóa chỉ được đặt sớm tối đa 3 ngày trước ngày bắt đầu thuê.");
      if (scheduledAt.slice(0, 10) >= selectedReservation.endDate) throw new Error('Ngày bàn giao phải trước ngày kết thúc kỳ thuê (không bao gồm ngày kết thúc).');
      const created = await mutate<CustomerAppointment>(
        "/customer/appointments",
        "POST",
        {
          reservationId,
          scheduledAt: requestedTime.toISOString(),
          note: note.trim() || undefined,
        },
        true,
      );
      setMessage({ kind: "ok", text: created.status === "CONFIRMED" ? "Lịch nhận kho hợp lệ đã được xác nhận tự động." : "Đã ghi nhận lịch nhận kho. Vui lòng xem trạng thái xử lý trong danh sách." });
      setReservationId("");
      setScheduledAt("");
      setNote("");
      appointments.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Không thể tạo lịch hẹn.",
      });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="customer-page">
      <PortalPageHeader
        eyebrow="Lịch hẹn"
        title="Lịch bàn giao của tôi"
        description="Đặt lịch khi hợp đồng đủ điều kiện. Lịch hợp lệ được xác nhận tự động và chuyển cho nhân viên bàn giao kho."
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={appointments.refresh}
            disabled={appointments.loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      <div className="customer-module-layout">
        <section className="customer-panel">
          <div className="customer-module-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === "upcoming"}
              className={view === "upcoming" ? "is-active" : ""}
              onClick={() => setView("upcoming")}
            >
              <CalendarClock size={17} /> Chờ nhận kho
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "past"}
              className={view === "past" ? "is-active" : ""}
              onClick={() => setView("past")}
            >
              <History size={17} /> Đã hoàn tất / hủy
            </button>
          </div>
          {appointments.status === 401 ? (
            <CustomerSessionExpired />
          ) : appointments.loading ? (
            <PortalLoading label="Đang tải lịch hẹn…" />
          ) : appointments.error ? (
            <PortalError
              message={appointments.error}
              onRetry={appointments.refresh}
            />
          ) : visible.length === 0 ? (
            <PortalEmpty
              icon={<CalendarClock size={30} />}
              title={
                view === "upcoming"
                  ? "Chưa có lịch chờ nhận kho"
                  : "Chưa có lịch sử hẹn"
              }
            >
              <span>Lịch bàn giao của bạn sẽ được hiển thị tại đây.</span>
            </PortalEmpty>
          ) : (
            <div className="customer-card-list">
              {visible.map((item) => (
                <article
                  className="customer-record-card customer-record-card--compact"
                  key={item.id}
                >
                  <div className="customer-record-heading">
                    <div>
                      <small>{item.appointmentCode}</small>
                      <h2>{formatPortalDate(item.scheduledAt, true)}</h2>
                    </div>
                    <CustomerStatus status={item.status} />
                  </div>
                  <p>
                    Yêu cầu đặt kho: <strong>{item.reservation.reference}</strong>
                  </p>
                  {item.allocatedUnits.length > 0 && (
                    <p>
                      Kho:{" "}
                      {item.allocatedUnits
                        .map((unit) => unit.unitCode)
                        .join(", ")}
                    </p>
                  )}
                  {item.note && <p>Ghi chú: {item.note}</p>}
                  {workflowGuide('appointments', item.status, 'customer') && <WorkflowHint>{workflowGuide('appointments', item.status, 'customer')}</WorkflowHint>}
                </article>
              ))}
            </div>
          )}
        </section>
        <form className="customer-panel customer-module-form" onSubmit={submit}>
          <CustomerFormSources
            resources={[contracts, appointments]}
            retry={() => {
              contracts.refresh();
              appointments.refresh();
            }}
          />
          <fieldset
            disabled={
              submitting ||
              [contracts, appointments].some(
                (resource) => resource.loading || resource.error,
              )
            }
          >
            <h2>Đặt lịch nhận kho</h2>
            <p>
              Chỉ yêu cầu đã thanh toán và có hợp đồng chờ bàn giao mới được
              đặt lịch.
            </p>
            <label className="field-label">
              Yêu cầu đặt kho
              <select
                aria-label="Yêu cầu đặt kho"
                required
                value={reservationId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextReservation = eligibleReservations.find(
                    (item) => item.id === nextId,
                  );
                  setReservationId(nextId);
                  if (
                    nextReservation &&
                    scheduledAt &&
                    (scheduledAt.slice(0, 10) < nextReservation.pickupStart || scheduledAt.slice(0, 10) >= nextReservation.endDate)
                  )
                    setScheduledAt("");
                }}
              >
                <option value="">Chọn yêu cầu đặt kho</option>
                {eligibleReservations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.reference}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Ngày giờ mong muốn
              <input
                required
                type="datetime-local"
                aria-describedby="appointment-timezone"
                min={minimumAppointment}
                max={maximumAppointment}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
            <small id="appointment-timezone">
              Ngày giờ tại cơ sở NestBox (UTC+7). Có thể hẹn nhận chìa khóa sớm từ
              {selectedReservation
                ? ` ${formatPortalDate(selectedReservation.pickupStart)}, đến trước ngày ${formatPortalDate(selectedReservation.endDate)}. Quyền sử dụng kho chỉ bắt đầu từ ${formatPortalDate(selectedReservation.startDate)}.`
                : ' tối đa 3 ngày trước khi bắt đầu thuê và trước ngày kết thúc kỳ thuê.'}
            </small>
            <label className="field-label">
              Ghi chú
              <textarea
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {message && (
              <p
                className={`customer-form-message is-${message.kind}`}
                role="status"
              >
                {message.text}
              </p>
            )}
            <button
              className="button-primary"
              type="submit"
              disabled={submitting || !reservationId || !scheduledAt}
            >
              <CalendarPlus size={17} />{" "}
              {submitting ? "Đang gửi…" : "Gửi yêu cầu"}
            </button>
            {!contracts.loading && eligibleReservations.length === 0 && (
              <small>Hiện chưa có yêu cầu đặt kho đủ điều kiện đặt lịch.</small>
            )}
          </fieldset>
        </form>
      </div>
      {pagination}
    </section>
  );
}
