import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  HardHat,
  Headphones,
  RefreshCw,
  Warehouse,
} from "lucide-react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { usePortalSnapshot } from "../../services/usePortalSnapshot";
import { code, date, first, money } from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";

const work = [
  {
    key: "pendingReservations",
    name: "Đặt kho chờ xử lý",
    path: "/manager/reservations?status=PENDING",
    icon: ClipboardCheck,
  },
  {
    key: "overdueRentals",
    name: "Kỳ thuê quá hạn",
    path: "/manager/operations/rentals?status=true",
    icon: AlertTriangle,
  },
  {
    key: "pendingRenewals",
    name: "Gia hạn chưa hoàn tất",
    path: "/manager/operations/renewals",
    icon: CalendarClock,
  },
  {
    key: "openSupportRequests",
    name: "Yêu cầu hỗ trợ đang mở",
    path: "/manager/operations/support-requests",
    icon: Headphones,
  },
  {
    key: "maintenanceUnits",
    name: "Kho đang bảo trì",
    path: "/manager/operations/maintenance",
    icon: HardHat,
  },
  {
    key: "pendingDepositSettlements",
    name: "Quyết toán chưa hoàn tất",
    path: "/manager/operations/deposit-settlements",
    icon: Warehouse,
  },
];
export function ManagerOverviewPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = usePortalSnapshot();
  const total = data?.units.total ?? 0;
  const occupied =
    data?.units.items.filter((row) => row.status === "OCCUPIED").length ?? 0;
  const reservations =
    data?.reservations.items
      .filter((row) => row.status === "PENDING")
      .slice(0, 5) ?? [];
  const appointments =
    data?.appointments.items
      .filter(
        (row) =>
          ["REQUESTED", "CONFIRMED"].includes(first(row, "status")) &&
          new Date(first(row, "scheduledAt")).getTime() >= data.asOf,
      )
      .slice(0, 5) ?? [];
  return (
    <section>
      <PageHeader
        title="Tổng quan vận hành"
        description={`Xin chào ${user?.fullName ?? ""}. Theo dõi kho và công việc cần xử lý tại cơ sở.`}
      >
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <LoadState loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <div className="portal-metrics">
            {[
              ["Tổng kho vật lý", total, "/manager/units"],
              ["Kho đang sử dụng", occupied, "/manager/units?status=OCCUPIED"],
              [
                "Kho sẵn sàng",
                first(data.summary, 'availableUnits') || '—',
                "/manager/units?status=AVAILABLE",
              ],
              [
                "Kỳ thuê đang hoạt động",
                first(data.summary, 'activeRentals') || '—',
                "/manager/operations/rentals",
              ],
            ].map(([title, value, to]) => (
              <Link className="portal-metric" key={title} to={String(to)}>
                <span>{title}</span>
                <strong>{value}</strong>
                <small>
                  Xem chi tiết <ArrowRight size={14} />
                </small>
              </Link>
            ))}
          </div>
          <div className="portal-overview-grid">
            <section className="manager-section">
              <div className="portal-section-title">
                <h2>Tình trạng kho</h2>
                <strong>
                  {total ? Math.round((occupied / total) * 100) : 0}% đang sử
                  dụng
                </strong>
              </div>
              <div
                className="portal-capacity"
                role="img"
                aria-label={`Kho đang sử dụng ${occupied} trên ${total}`}
              >
                {["OCCUPIED", "AVAILABLE", "RESERVED", "MAINTENANCE"].map(
                  (status) => {
                    const count = data.units.items.filter(
                      (row) => row.status === status,
                    ).length;
                    return (
                      <div
                        key={status}
                        className={`is-${status.toLowerCase()}`}
                        style={{
                          width: `${total ? (count / total) * 100 : 0}%`,
                        }}
                      />
                    );
                  },
                )}
              </div>
              <div className="portal-capacity-legend">
                {["OCCUPIED", "AVAILABLE", "RESERVED", "MAINTENANCE"].map(
                  (status) => (
                    <Link key={status} to={`/manager/units?status=${status}`}>
                      <Status value={status} />
                      <strong>
                        {
                          data.units.items.filter(
                            (row) => row.status === status,
                          ).length
                        }
                      </strong>
                    </Link>
                  ),
                )}
              </div>
              <p className="manager-action-copy">
                Khả dụng theo kỳ thuê còn phụ thuộc lịch phân bổ. Kho quá hạn
                vẫn được giữ cho đến khi khách trả thực tế.
              </p>
            </section>
            <section className="manager-section">
              <h2>Công việc cần theo dõi</h2>
              <div className="portal-work-list">
                {work.map(({ key, name, path, icon: Icon }) => (
                  <Link key={key} to={path}>
                    <Icon size={18} />
                    <span>{name}</span>
                    <strong
                      className={
                        Number(data.summary[key]) > 0 ? "portal-work-count" : ""
                      }
                    >
                      {first(data.summary, key)}
                    </strong>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            </section>
          </div>
          <div className="portal-overview-grid">
            <section className="manager-section">
              <div className="portal-section-title">
                <h2>Đặt kho chờ duyệt</h2>
                <Link to="/manager/reservations?status=PENDING">
                  Xem tất cả →
                </Link>
              </div>
              {reservations.length ? (
                <div className="portal-work-list">
                  {reservations.map((row) => (
                    <Link
                      key={code(row)}
                      to={`/manager/reservations/${encodeURIComponent(first(row, "id"))}`}
                    >
                      <div>
                        <strong>{first(row, "customer.fullName")}</strong>
                        <small>
                          {code(row)} · {row.quantity as number} kho ·{" "}
                          {first(row, "product.name")}
                        </small>
                      </div>
                      <ArrowRight size={18} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Đã xử lý hết yêu cầu đặt kho"
                  description="Các yêu cầu mới sẽ xuất hiện tại đây."
                />
              )}
            </section>
            <section className="manager-section">
              <div className="portal-section-title">
                <h2>Lịch bàn giao sắp tới</h2>
                <Link to="/manager/operations/appointments">Xem lịch →</Link>
              </div>
              {appointments.length ? (
                <div className="portal-work-list">
                  {appointments.map((row) => (
                    <Link
                      key={code(row)}
                      to={`/manager/operations/appointments/${encodeURIComponent(first(row, "id"))}`}
                    >
                      <div>
                        <strong>{date(row.scheduledAt, true)}</strong>
                        <small>
                          {first(row, "reservation.customer.fullName")} ·{" "}
                          {code(row)}
                        </small>
                      </div>
                      <Status value={row.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Chưa có lịch bàn giao sắp tới"
                  description="Lịch nhận kho của khách sẽ hiển thị tại đây."
                />
              )}
            </section>
          </div>
          <section className="portal-finance-strip">
            <div>
              <span>Tổng dư nợ hóa đơn</span>
              <strong>
                {money(
                  data.invoices.items.reduce(
                    (sum, row) => sum + Number(row.balanceDue),
                    0,
                  ),
                )}
              </strong>
            </div>
            <Link
              className="button-secondary"
              to="/manager/operations/invoices"
            >
              Theo dõi công nợ <ArrowRight size={16} />
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
