import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveRefresh } from '../../services/live-events';
import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import {
  code,
  first,
  label,
  customer,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  Facts,
  LoadState,
  Modal,
  PageHeader,
  Pagination,
  Status,
} from "../../components/manager/PortalUi";
import { allPages, mutate } from "../../services/portal";
import { StaffPicker } from '../../components/manager/StaffPicker';
import { staffFromWork } from '../../utils/staff';
import { assignmentWorkRank } from '../../utils/work-queue';
import { isEarlyReturnRequest } from '../../utils/early-return';

type WorkKind = "support-requests" | "maintenance" | "stock-movements";
type Task = { kind: WorkKind; row: Row };

const workName = (kind: WorkKind) =>
  kind === "maintenance" ? "Bảo trì" : kind === 'stock-movements' ? 'Nhập – xuất hàng' : "Hỗ trợ";
const finished = (task: Task) =>
  task.row.status === "COMPLETED" || task.row.status === "RESOLVED" || task.row.status === 'CANCELLED';
const relatedUnit = (row: Row) =>
  first(
    row,
    "storageUnit.unitNumber",
    "unit.unitCode",
    "reservation.reference",
    'rentalContract.contractCode',
  ) || "—";

export function ManagerAssignmentsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh('/manager/*', refresh);
  const [selected, setSelected] = useState<Task>();
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<{
    key: string;
    tasks?: Task[];
    error?: string;
  }>();
  const key = `${user?.id}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      allPages("/manager/support-requests", controller.signal),
      allPages("/manager/maintenance", controller.signal),
      allPages('/manager/stock-movements', controller.signal),
    ])
      .then(([support, maintenance, movements]) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          tasks: [
            ...movements.items.map(row => ({ kind: 'stock-movements' as const, row })),
            ...support.items.filter(row => !isEarlyReturnRequest(row)).map((row) => ({
              kind: "support-requests" as const,
              row,
            })),
            ...maintenance.items.map((row) => ({
              kind: "maintenance" as const,
              row,
            })),
          ],
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải công việc.",
          });
      });
    return () => controller.abort();
  }, [key]);

  const current = state?.key === key ? state : undefined;
  const allTasks = current?.tasks ?? [];
  const search = params.get("search") ?? "";
  const kind = params.get("kind") ?? "all";
  const assignment = params.get("assignment") ?? "all";
  const scope = params.get("scope") ?? "active";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const tasks = allTasks.filter((task) => {
    const assigned = Boolean(first(task.row, "assignedStaff.id"));
    return (
      (kind === "all" || task.kind === kind) &&
      (scope !== "active" || !finished(task)) &&
      (assignment === "all" ||
        (assignment === "assigned" ? assigned : !assigned)) &&
      [
        code(task.row),
        relatedUnit(task.row),
        first(task.row, "subject"),
        first(task.row, "description"),
        first(task.row, "assignedStaff.fullName"),
        first(customer(task.row), 'fullName', 'email'),
        first(customer(task.row), 'phone'),
        label(task.row.status),
      ]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi"))
    );
  });
  tasks.sort((a, b) => assignmentWorkRank(a.row) - assignmentWorkRank(b.row) || (Date.parse(first(a.row, 'requestedAt', 'createdAt')) || 0) - (Date.parse(first(b.row, 'requestedAt', 'createdAt')) || 0));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(tasks.length / 20)));
  const knownStaff = staffFromWork(allTasks.map(task => task.row));
  const workloads = new Map<string, number>();
  for (const task of allTasks) { const staffId = first(task.row, 'assignedStaff.id'); if (staffId && !finished(task)) workloads.set(staffId, (workloads.get(staffId) ?? 0) + 1); }
  const change = (name: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (
          value &&
          value !== "all" &&
          !(name === "scope" && value === "active")
        )
          next.set(name, value);
        else next.delete(name);
        if (name !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );

  return (
    <section>
      <PageHeader
        title="Phân công nhân viên"
        description="Phân công nhân viên phụ trách hỗ trợ, bảo trì và phiếu nhập – xuất hàng khách."
      >
        <button
          className="button-secondary"
          disabled={!current}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} /> Làm mới
        </button>
      </PageHeader>
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <div className="portal-toolbar">
        <label className="field-label portal-search">
          Tìm công việc
          <input
            type="search"
            value={search}
            onChange={(event) => change("search", event.target.value)}
            placeholder="Mã, kho hoặc nhân viên…"
          />
        </label>
        <label className="field-label">
          Nhóm
          <select
            value={kind}
            onChange={(event) => change("kind", event.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="support-requests">Hỗ trợ</option>
            <option value="maintenance">Bảo trì</option>
            <option value="stock-movements">Nhập – xuất hàng</option>
          </select>
        </label>
        <label className="field-label">
          Phân công
          <select
            value={assignment}
            onChange={(event) => change("assignment", event.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="unassigned">Chưa phân công</option>
            <option value="assigned">Đã phân công</option>
          </select>
        </label>
        <label className="field-label">
          Trạng thái
          <select
            value={scope}
            onChange={(event) => change("scope", event.target.value)}
          >
            <option value="active">Chưa hoàn tất</option>
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
                    <th>Đối tượng / Kho</th>
                    <th>Nhân viên phụ trách</th>
                    <th>Ưu tiên</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks
                    .slice((currentPage - 1) * 20, currentPage * 20)
                    .map((task) => (
                      <tr key={`${task.kind}:${first(task.row, "id")}`}>
                        <td>
                          <strong>{code(task.row)}</strong>
                          <small>
                            {first(task.row, "subject", "category")}
                          </small>
                        </td>
                        <td>{workName(task.kind)}</td>
                        <td><strong>{first(customer(task.row), 'fullName') || '—'}</strong><small>{first(customer(task.row), 'phone', 'email')}</small>{relatedUnit(task.row)}</td>
                        <td>
                          {first(task.row, "assignedStaff.fullName") ||
                            "Chưa phân công"}
                        </td>
                        <td>{label(task.row.priority)}</td>
                        <td>
                          <Status value={task.row.status} />
                        </td>
                        <td>
                          <button
                            className="button-secondary"
                            onClick={() => setSelected(task)}
                          >
                            {finished(task)
                              ? "Xem"
                              : first(task.row, "assignedStaff.id")
                                ? "Xem / Đổi"
                                : "Phân công"}
                          </button>
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
            page={currentPage}
            limit={20}
            total={tasks.length}
            onChange={(value) => change("page", String(value))}
          />
        </>
      )}
      {selected && (
        <AssignmentDetail
          key={`${selected.kind}:${first(selected.row, "id")}`}
          task={selected}
          knownStaff={knownStaff}
          workloads={workloads}
          onClose={() => setSelected(undefined)}
          onAssigned={() => {
            setSelected(undefined);
            setNotice("Đã cập nhật nhân viên phụ trách.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}

function AssignmentDetail({
  task,
  knownStaff,
  workloads,
  onClose,
  onAssigned,
}: {
  task: Task;
  knownStaff: Map<string, string>;
  workloads: Map<string, number>;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const id = first(task.row, "id");
  const [staffId, setStaffId] = useState(first(task.row, "assignedStaff.id"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || !staffId.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/manager/${task.kind}/${encodeURIComponent(id)}/assign`,
        "PATCH",
        { staffUserId: staffId.trim() },
        true,
      );
      onAssigned();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể phân công nhân viên.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${workName(task.kind)} · ${code(task.row)}`}
      onClose={onClose}
      busy={busy}
    >
      <div className="portal-form">
        <Facts
          items={[
            ['Khách hàng', first(customer(task.row), 'fullName') || '—'],
            ['Liên hệ', first(customer(task.row), 'phone', 'email') || '—'],
            ['Hợp đồng', first(task.row, 'contract.contractCode', 'rentalContract.contractCode') || '—'],
            [
              "Trạng thái",
              <Status key="work-status" value={task.row.status} />,
            ],
            ["Ưu tiên", label(task.row.priority)],
            ["Kho / Đặt thuê", relatedUnit(task.row)],
            [
              "Nhân viên hiện tại",
              first(task.row, "assignedStaff.fullName") || "Chưa phân công",
            ],
            ["Nội dung", first(task.row, "subject", "description") || "—"],
          ]}
        />
        {first(task.row, "subject") && first(task.row, "description") && (
          <p>{first(task.row, "description")}</p>
        )}
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        {!finished(task) && (
          <form className="portal-form" onSubmit={assign}>
            <StaffPicker value={staffId} onChange={value => { setStaffId(value); setError(''); }} knownStaff={knownStaff} workloads={workloads} disabled={busy} />
            <div className="portal-actions">
              <button
                className="button-primary"
                disabled={
                  busy ||
                  !staffId.trim() ||
                  staffId === first(task.row, "assignedStaff.id")
                }
              >
                {busy
                  ? "Đang lưu…"
                  : first(task.row, "assignedStaff.id")
                    ? "Đổi nhân viên"
                    : "Phân công"}
              </button>
            </div>
          </form>
        )}
        <Link
          className="button-secondary"
          to={`/manager/operations/${task.kind}/${encodeURIComponent(id)}`}
          onClick={onClose}
        >
          Xem hồ sơ công việc
        </Link>
      </div>
    </Modal>
  );
}
