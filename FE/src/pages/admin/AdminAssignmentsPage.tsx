import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { allPages } from "../../services/portal";
import {
  code,
  first,
  label,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Pagination,
  Status,
} from "../../components/manager/PortalUi";

type Task = { kind: "maintenance" | "support-requests"; row: Row };
export function AdminAssignmentsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    tasks?: Task[];
    error?: string;
  }>();
  const key = `${user?.id}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      allPages("/manager/maintenance", controller.signal),
      allPages("/manager/support-requests", controller.signal),
    ])
      .then(([maintenance, support]) => {
        if (!controller.signal.aborted)
          setState({
            key,
            tasks: [
              ...maintenance.items.map((row) => ({
                kind: "maintenance" as const,
                row,
              })),
              ...support.items.map((row) => ({
                kind: "support-requests" as const,
                row,
              })),
            ],
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải phân công.",
          });
      });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  const search = params.get("search") ?? "";
  const filter = params.get("assignment") ?? "open";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const tasks = (current?.tasks ?? []).filter(({ row }) => {
    const completed = row.status === "COMPLETED" || row.status === "RESOLVED";
    const assigned = Boolean(first(row, "assignedStaff.id"));
    return (
      (filter !== "open" || !completed) &&
      (filter !== "unassigned" || (!assigned && !completed)) &&
      (filter !== "assigned" || (assigned && !completed)) &&
      [
        code(row),
        first(row, "assignedStaff.fullName", "unit.unitCode"),
        label(row.status),
      ]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi"))
    );
  });
  const change = (name: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(name, value);
        if (name !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  return (
    <section>
      <PageHeader
        title="Phân công nhân viên"
        description="Giao hoặc đổi nhân viên phụ trách công việc hỗ trợ và bảo trì."
      >
        <button
          className="button-secondary"
          disabled={!current}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <div className="portal-toolbar">
        <label className="field-label portal-search">
          Tìm công việc
          <input
            type="search"
            value={search}
            onChange={(event) => change("search", event.target.value)}
            placeholder="Mã công việc, nhân viên, trạng thái…"
          />
        </label>
        <label className="field-label">
          Phân công
          <select
            value={filter}
            onChange={(event) => change("assignment", event.target.value)}
          >
            <option value="open">Chưa hoàn tất</option>
            <option value="unassigned">Chưa phân công</option>
            <option value="assigned">Đã phân công</option>
            <option value="all">Tất cả</option>
          </select>
        </label>
      </div>
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={() => setRevision((value) => value + 1)}
      />
      {current?.tasks && (
        <>
          <div className="portal-result-heading">
            <span>{tasks.length} công việc</span>
          </div>
          {tasks.length ? (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Công việc</th>
                    <th>Nhóm</th>
                    <th>Nhân viên phụ trách</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks
                    .slice((page - 1) * 20, page * 20)
                    .map(({ kind, row }) => (
                      <tr key={`${kind}:${first(row, "id")}`}>
                        <td>
                          <strong>{code(row)}</strong>
                          <small>
                            {first(
                              row,
                              "unit.unitCode",
                              "storageUnit.unitCode",
                            )}
                          </small>
                        </td>
                        <td>{kind === "maintenance" ? "Bảo trì" : "Hỗ trợ"}</td>
                        <td>
                          {first(row, "assignedStaff.fullName") ||
                            "Chưa phân công"}
                        </td>
                        <td>
                          <Status value={row.status} />
                        </td>
                        <td>
                          <Link
                            className="button-secondary"
                            to={`/admin/facility/operations/${kind}/${encodeURIComponent(first(row, "id"))}`}
                          >
                            {row.status === "COMPLETED" ||
                            row.status === "RESOLVED"
                              ? "Xem công việc"
                              : "Xem và phân công"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
          <Pagination
            page={page}
            limit={20}
            total={tasks.length}
            onChange={(value) => change("page", String(value))}
          />
        </>
      )}
      <p className="portal-hint">
        Phân công theo ca hoặc theo khu vực cơ sở hiện chưa được hỗ trợ.
      </p>
    </section>
  );
}
