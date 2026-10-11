import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { first, type Row } from "../../components/manager/portal-data";
import { LoadState, PageHeader } from "../../components/manager/PortalUi";
import { staffDay } from "./staff-resources";

export function StaffOperationsPage() {
  const { user } = useAuth();
  const appointments = usePaginatedResource<Row>(
    "/staff/appointments",
    user?.id ?? "",
  );
  const rentals = usePaginatedResource<Row>("/staff/rentals", user?.id ?? "");
  const returns = usePaginatedResource<Row>("/staff/returns", user?.id ?? "");
  const maintenance = usePaginatedResource<Row>(
    "/staff/maintenance",
    user?.id ?? "",
  );
  const support = usePaginatedResource<Row>(
    "/staff/support-requests",
    user?.id ?? "",
  );
  const sources = [appointments, rentals, returns, maintenance, support];
  const today = staffDay(appointments.asOf);
  const refresh = () => sources.forEach((source) => source.refresh());
  const loading = sources.some((source) => source.loading),
    error = sources.find((source) => source.error)?.error ?? "";
  return (
    <section>
      <PageHeader
        title="Tác nghiệp tại cơ sở"
        description={`Xin chào ${user?.fullName ?? ""}. Theo dõi lịch và các công việc cần xử lý.`}
      >
        <button
          className="button-secondary"
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <LoadState loading={loading} error={error} retry={refresh} />
      {!loading && !error && (
        <div className="portal-metrics">
          {[
            {
              title: "Lịch bàn giao hôm nay",
              value: appointments.data!.items.filter(
                (row) =>
                  ["REQUESTED", "CONFIRMED"].includes(String(row.status)) &&
                  staffDay(row.scheduledAt) === today,
              ).length,
              to: `/staff/appointments?date=${today}`,
            },
            {
              title: "Chờ bàn giao",
              value: appointments.data!.items.filter(
                (row) => row.status === "CONFIRMED",
              ).length,
              to: "/staff/appointments?status=CONFIRMED",
            },
            {
              title: "Kho đang thuê",
              value: rentals.data!.total,
              to: "/staff/rentals",
            },
            {
              title: "Chờ kiểm tra trả kho",
              value: returns.data!.items.filter((row) =>
                ["REQUESTED", "INSPECTION_IN_PROGRESS", "ISSUE_FOUND"].includes(
                  String(row.status),
                ),
              ).length,
              to: "/staff/returns",
            },
            {
              title: "Bảo trì được giao",
              value: maintenance.data!.items.filter(
                (row) =>
                  first(row, "assignedStaff.id") === user?.id &&
                  ["OPEN", "IN_PROGRESS"].includes(String(row.status)),
              ).length,
              to: "/staff/maintenance?mine=true",
            },
            {
              title: "Hỗ trợ được giao",
              value: support.data!.items.filter(
                (row) =>
                  first(row, "assignedStaff.id") === user?.id &&
                  ["ASSIGNED", "IN_PROGRESS"].includes(String(row.status)),
              ).length,
              to: "/staff/support-requests?mine=true",
            },
          ].map((item) => (
            <Link className="portal-metric" key={item.to} to={item.to}>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
              <small>Mở danh sách →</small>
            </Link>
          ))}
        </div>
      )}
      <section className="manager-section">
        <h2>Thao tác tại cơ sở</h2>
        <div className="portal-actions">
          <Link className="button-secondary" to="/staff/appointments">
            Bàn giao kho
          </Link>
          <Link className="button-secondary" to="/staff/returns">
            Kiểm tra trả kho
          </Link>
          <Link className="button-secondary" to="/staff/maintenance">
            Xử lý bảo trì
          </Link>
          <Link className="button-secondary" to="/staff/support-requests">
            Hỗ trợ khách hàng
          </Link>
          <Link className="button-secondary" to="/staff/transfers">
            Hoàn tất chuyển kho
          </Link>
        </div>
      </section>
    </section>
  );
}
