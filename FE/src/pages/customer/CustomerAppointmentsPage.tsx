import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { CustomerFormSources } from "../../components/customer/CustomerFormSources";
import { mutate } from "../../services/portal";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { CalendarClock, CalendarPlus, History, RefreshCw } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import { formatPortalDate } from "../../components/customer/CustomerPortalHelpers";
import {
  CustomerStatus,
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
} from "../../components/customer/CustomerPortalUi";
import { ApiError } from "../../services/api";
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
  const [openedAt] = useState(() => Date.now());
  const earliestAppointment = new Date(openedAt + 60000 + 7 * 60 * 60000)
    .toISOString()
    .slice(0, 16);
  const eligibleReservations = useMemo(() => {
    const map = new Map<string, { id: string; reference: string }>();
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
    for (const [id, items] of groups)
      if (
        items.length === items[0].reservation.quantity &&
        items.every((item) => item.status === "READY_FOR_HANDOVER") &&
        !active.has(id)
      )
        map.set(id, { id, reference: items[0].reservation.reference });
    return [...map.values()];
  }, [contracts.data, appointments.data]);
  const filteredAppointments = (appointments.data?.items ?? []).filter(
    (item) =>
      view === "upcoming"
        ? new Date(item.scheduledAt).getTime() >=
            (appointments.asOf || openedAt) &&
          !["COMPLETED", "CANCELLED"].includes(item.status)
        : new Date(item.scheduledAt).getTime() <
            (appointments.asOf || openedAt) ||
          ["COMPLETED", "CANCELLED"].includes(item.status),
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
      const requestedTime = new Date(`${scheduledAt}+07:00`);
      if (
        !Number.isFinite(requestedTime.getTime()) ||
        requestedTime.getTime() <= Date.now()
      )
        throw new Error("Lịch hẹn phải ở thời điểm tương lai.");
      await mutate<CustomerAppointment>(
        "/customer/appointments",
        "POST",
        {
          reservationId,
          scheduledAt: requestedTime.toISOString(),
          note: note.trim() || undefined,
        },
        true,
      );
      setMessage({ kind: "ok", text: "Đã gửi yêu cầu lịch bàn giao." });
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
        description="Theo dõi và gửi yêu cầu lịch bàn giao cho reservation đủ điều kiện."
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
              <CalendarClock size={17} /> Sắp tới
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "past"}
              className={view === "past" ? "is-active" : ""}
              onClick={() => setView("past")}
            >
              <History size={17} /> Đã qua
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
                  ? "Chưa có lịch hẹn sắp tới"
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
                    Reservation: <strong>{item.reservation.reference}</strong>
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
            <h2>Yêu cầu lịch bàn giao</h2>
            <p>
              Chỉ reservation đã thanh toán và có hợp đồng chờ bàn giao mới được
              đặt lịch.
            </p>
            <label className="field-label">
              Reservation
              <select
                aria-label="Reservation"
                required
                value={reservationId}
                onChange={(event) => setReservationId(event.target.value)}
              >
                <option value="">Chọn reservation</option>
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
                min={earliestAppointment}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
            <small id="appointment-timezone">
              Ngày giờ tại cơ sở WDP (UTC+7).
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
              <small>Hiện chưa có reservation đủ điều kiện đặt lịch.</small>
            )}
          </fieldset>
        </form>
      </div>
      {pagination}
    </section>
  );
}
