import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  HardHat,
  Headphones,
  RefreshCw,
  Repeat2,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { useActivity } from "../../activity/context";
import { ActivitySummary } from "../../activity/ActivityCenter";
import { activitySources } from "../../utils/activity";
import { code, first, date } from "../../components/manager/portal-data";
import { PageHeader, Status } from "../../components/manager/PortalUi";
import { WorkHub, WorkflowHint } from "../../components/workspace/WorkHub";
import {
  awaitingAssignment,
  staffNeedsAction,
  staffWorkGroups,
  staffWorkRank,
} from "../../utils/work-queue";

const icons = {
  reservations: ClipboardCheck,
  inquiries: Headphones,
  appointments: CalendarClock,
  "stock-movements": ClipboardCheck,
  renewals: Repeat2,
  transfers: Repeat2,
  returns: RotateCcw,
  "support-requests": Headphones,
  maintenance: HardHat,
};

export function StaffOperationsPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const sources = activitySources("STAFF");
  const groups = staffWorkGroups.map((group) => {
    const items = activity.data[group.resource] ?? [];
    return {
      ...group,
      path: `/staff/${group.resource}`,
      items: items.filter((row) =>
        staffNeedsAction(group.resource, row, user?.id ?? ""),
      ),
      waiting: items.filter((row) => awaitingAssignment(group.resource, row))
        .length,
      unavailable:
        activity.loading ||
        !activity.data[group.resource] ||
        activity.failed.includes(
          sources.find((source) => source.kind === group.resource)!.title,
        ),
    };
  });
  const queue = groups
    .flatMap((group) =>
      group.items.map((row) => ({
        row,
        group,
        path: `${group.path}/${encodeURIComponent(first(row, "id"))}`,
      })),
    )
    .sort(
      (a, b) =>
        staffWorkRank(a.group.resource, a.row) -
          staffWorkRank(b.group.resource, b.row) ||
        (Date.parse(first(a.row, "scheduledAt", "createdAt")) || 0) -
          (Date.parse(first(b.row, "scheduledAt", "createdAt")) || 0),
    );
  const waiting = groups.reduce((sum, group) => sum + group.waiting, 0);
  return (
    <section className="workspace-home">
      <PageHeader
        title="Bàn làm việc"
        description={`Chào ${user?.fullName ?? "bạn"}. Tiếp nhận yêu cầu, theo dõi lịch và hoàn tất phần việc của bạn.`}
      >
        <button
          className="button-secondary"
          disabled={activity.checking}
          onClick={activity.refresh}
        >
          <RefreshCw size={16} />
          {activity.checking ? "Đang cập nhật…" : "Làm mới"}
        </button>
      </PageHeader>
      <ActivitySummary />
      <section className="work-queue" aria-label="Ưu tiên xử lý">
        <div className="work-hub-heading">
          <div>
            <h2>Ưu tiên xử lý</h2>
            <p>
              Việc ưu tiên cao và lịch đã đến giờ được đưa lên trước. Chỉ hiển
              thị hồ sơ bạn có thể xử lý.
            </p>
          </div>
        </div>
        {activity.loading && (
          <p role="status" className="workspace-muted">
            Đang cập nhật công việc…
          </p>
        )}
        {queue.length > 0 ? (
          <div className="workspace-shortcuts">
            {queue.slice(0, 6).map(({ row, group, path }) => (
              <Link key={path} to={path}>
                <span className="work-queue-marker" />
                <div>
                  <strong>{code(row)}</strong>
                  <span>
                    {group.title} ·{" "}
                    {first(
                      row,
                      "customer.fullName",
                      "reservation.customer.fullName",
                      "subject",
                      "storageUnit.unitNumber",
                    ) || "Mở hồ sơ để đối chiếu"}
                    {row.scheduledAt ? ` · ${date(row.scheduledAt, true)}` : ""}
                  </span>
                </div>
                <Status value={row.status} />
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          !activity.loading && (
            <p className="workspace-empty">
              {activity.failed.length
                ? "Chưa tải đủ dữ liệu. Mở từng nhóm bên dưới hoặc thử Làm mới."
                : "Bạn chưa có việc cần xử lý trong các nhóm hiện tại."}
            </p>
          )
        )}
        {waiting > 0 && (
          <p className="workspace-waiting">
            {waiting} hồ sơ đang chờ quản lý phân công. Các hồ sơ này chưa được
            tính vào việc bạn cần xử lý.
          </p>
        )}
      </section>
      <WorkHub
        title="Các nhóm công việc"
        description="Số hồ sơ cần bạn xử lý. Mở danh sách để xem toàn bộ hồ sơ và lịch sử."
        actions={groups.map((group) => ({
          title: group.title,
          description:
            group.description +
            (group.waiting ? ` Có ${group.waiting} hồ sơ chờ phân công.` : ""),
          to: group.path,
          icon: icons[group.resource],
          count: group.unavailable ? "—" : group.items.length,
          tone: group.items.length ? "attention" : "normal",
        }))}
      />
      <WorkflowHint title="Phối hợp xử lý">
        Quản lý phân công hỗ trợ, bảo trì và giao nhận hàng. Khi được giao, mở
        hồ sơ để cập nhật kết quả; các khoản thu và tiền cọc do quản lý đối
        chiếu.
      </WorkflowHint>
      <Link className="button-secondary" to="/staff/rentals">
        Tra cứu kho đang thuê
      </Link>
    </section>
  );
}
