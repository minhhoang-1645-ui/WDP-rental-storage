import { ManagerTaskTable, ManagerTableSearch, ManagerTableFilter } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { TablePopover, type StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLiveRefresh } from '../../services/live-events';
import { Ellipsis, RefreshCw } from "lucide-react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import {
  code,
  first,
  label,
  customer,
  rows,
  date,
  type Row,
} from "../../components/manager/portal-data";
import {
  Facts,
  Modal,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";
import { allPages, mutate } from "../../services/portal";
import { StaffPicker } from '../../components/manager/StaffPicker';
import { staffFromWork } from '../../utils/staff';
import { assignmentNeedsAttention, assignmentWorkRank, canAssignWork } from '../../utils/work-queue';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { UnitStaffAssignments } from '../../components/manager/UnitStaffAssignments';
import { normalizeSearch } from '../../utils/notification-tools';

const workNames = {
  'support-requests': 'Hỗ trợ',
  maintenance: 'Bảo trì',
  'stock-movements': 'Nhập – xuất hàng',
  appointments: 'Lịch bàn giao',
  returns: 'Trả kho',
  transfers: 'Chuyển kho',
  'damage-claims': 'Sự cố hàng hóa',
};
type WorkKind = keyof typeof workNames;
type Task = { kind: WorkKind; row: Row };
const workKinds = Object.keys(workNames) as WorkKind[];
const workName = (kind: WorkKind) => workNames[kind];
const finished = (task: Task) => ['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED', 'PENDING_SETTLEMENT'].includes(String(task.row.status));
const canAssign = (task: Task) => canAssignWork(task.kind, task.row);
const relatedUnit = (row: Row) =>
  rows(row.allocatedUnits).map(unit => first(unit, 'unitCode')).filter(Boolean).join(', ') || first(
    row,
    "currentStorageUnit.unitNumber",
    "storageUnit.unitNumber",
    "unit.unitCode",
    "fromUnit.unitCode",
    "unitCodeSnapshot",
    "reservation.reference",
    'rentalContract.contractCode',
  ) || "—";

export function ManagerAssignmentsPage() {
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh('/manager/*', refresh);
  const [manualSelection, setSelected] = useState<Task>();
  const [unitAssignmentsOpen, setUnitAssignmentsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<{
    key: string;
    revision: number;
    tasks?: Task[];
    error?: string;
  }>();
  const key = user?.id ?? '';

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(workKinds.map(async kind => {
      const { items } = await allPages(`/manager/${kind}`, controller.signal);
      return items
        .filter(row => !(kind === 'support-requests' && isEarlyReturnRequest(row)) &&
          !(kind === 'transfers' && ['REQUESTED', 'REJECTED'].includes(String(row.status))))
        .map(row => ({ kind, row }));
    }))
      .then(groups => {
        if (controller.signal.aborted) return;
        setState({
          key,
          revision,
          tasks: groups.flat(),
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            revision,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải công việc.",
          });
      });
    return () => controller.abort();
  }, [key, revision]);

  const current = state?.key === key ? state : undefined;
  const refreshing = Boolean(current && current.revision !== revision);
  const allTasks = current?.tasks ?? [];
  const search = params.get("search") ?? "";
  const kind = params.get("kind") ?? "all";
  const record = params.get("record");
  const selected = manualSelection ?? (record ? allTasks.find(task =>
    task.kind === kind && first(task.row, "id") === record) : undefined);
  const assignment = params.get("assignment") ?? "all";
  const scope = params.get('scope') ?? 'active';
  const assignee = params.get('assignee') ?? '';
  const status = params.get('status') ?? scope;
  const order = params.get('sort') ?? '';
  const taskDate = ({ row }: Task) => first(row, 'requestedAt', 'createdAt');
  const tasks = allTasks.filter((task) => {
    const assigned = Boolean(first(task.row, "assignedStaff.id"));
    return (
      (kind === "all" || task.kind === kind) &&
      (!assignee || first(task.row, "assignedStaff.id") === assignee) &&
      (status === 'all' || (status === 'active' ? !finished(task) : task.row.status === status)) &&

      (assignment === "all" ||
        (assignment === "attention" ? assignmentNeedsAttention(task.kind, task.row) : assignment === "assigned" ? assigned : !assigned)) &&
      normalizeSearch([
        code(task.row),
        relatedUnit(task.row),
        first(task.row, "subject"),
        first(task.row, "description"),
        first(task.row, "assignedStaff.fullName"),
        first(customer(task.row), 'fullName', 'email'),
        first(customer(task.row), 'phone'),
        label(task.row.status),
      ]
        .join(" ")).includes(normalizeSearch(search))
    );
  });
  tasks.sort((a, b) => {
    const byDate = (Date.parse(taskDate(a)) || 0) - (Date.parse(taskDate(b)) || 0);
    return order === 'newest' ? -byDate : order === 'oldest' ? byDate : assignmentWorkRank(a.row) - assignmentWorkRank(b.row) || byDate;
  });
  const knownStaff = staffFromWork(allTasks.map(task => task.row));
  const workloads = new Map<string, number>();
  for (const task of allTasks) { const staffId = first(task.row, 'assignedStaff.id'); if (staffId && !finished(task)) workloads.set(staffId, (workloads.get(staffId) ?? 0) + 1); }
  const closeDetails = () => {
    setSelected(undefined);
    if (record) update('record', '');
  };
  const statuses = [...new Set(allTasks.map(task => first(task.row, 'status')).filter(Boolean))];
  const columns: StaffColumn<Task>[] = [
    { key: 'task', label: 'Công việc', cell: ({ kind, row }) => <><strong>{first(row, 'subject') || workName(kind)}</strong><CopyRecordCode value={code(row)} />{kind === 'appointments' && <small>Hẹn: {date(row.scheduledAt, true)}</small>}</> },
    { key: 'kind', label: 'Nhóm', optional: true, cell: task => workName(task.kind) },
    { key: 'customer', label: 'Khách hàng / Kho', cell: ({ row }) => <><strong>{first(customer(row), 'fullName') || relatedUnit(row)}</strong>{first(customer(row), 'fullName') && <small>{relatedUnit(row)}</small>}</> },
    { key: 'staff', label: 'Nhân viên phụ trách', cell: ({ row }) => <>{first(row, 'assignedStaff.fullName') || 'Chưa phân công'}{first(row, 'assignedStaff.accountStatus') === 'DISABLED' && <small>Đã vô hiệu hóa · cần đổi người</small>}</> },
    { key: 'date', label: 'Ngày yêu cầu', sort: { direction: order === 'oldest' ? 'ascending' : order === 'newest' ? 'descending' : 'none', toggle: () => update('sort', order === 'newest' ? 'oldest' : 'newest') }, cell: task => date(taskDate(task), true) },
    { key: 'priority', label: 'Ưu tiên', optional: true, cell: ({ row }) => first(row, 'priority') ? label(row.priority) : '—' },
    { key: 'status', label: 'Trạng thái', cell: ({ row }) => <Status value={row.status} /> },
    { key: 'actions', label: 'Thao tác', cell: task => <div className="staff-table-actions"><TablePopover
      name={`Thao tác ${code(task.row)}`} trigger={<Ellipsis size={18} aria-hidden="true" />}>
        <button type="button" onClick={event => {
          event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
          setSelected(task);
        }}>{!canAssign(task) ? 'Xem chi tiết' : first(task.row, 'assignedStaff.id') ? 'Xem / Đổi nhân viên' : 'Xem / Phân công'}</button>
      </TablePopover></div> },
  ];

  return (
    <section>
      <PageHeader title="Phân công nhân viên" description="Lịch nhận kho cần quản lý chọn người phụ trách trước khi nhân viên thực hiện bàn giao.">
        <button type="button" className="button-secondary" onClick={() => setUnitAssignmentsOpen(value => !value)}>{unitAssignmentsOpen ? 'Thu gọn phân công theo kho' : 'Phân công theo kho'}</button>
        <button type="button" className="button-secondary" disabled={!current || refreshing} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>
      </PageHeader>
      {unitAssignmentsOpen && <UnitStaffAssignments onSaved={refresh} />}
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <ManagerTaskTable title="Phân công nhân viên" columns={columns} loading={!current} refreshing={refreshing} error={current?.error} retry={refresh}
        items={tasks.slice((page - 1) * limit, page * limit)} rowKey={task => task.kind + ':' + first(task.row, 'id')}
        emphasized={task => canAssign(task) && assignmentNeedsAttention(task.kind, task.row)}
        page={page} limit={limit} total={tasks.length} update={update}
        toolbar={<>
          <ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Mã, kho hoặc nhân viên…" />
          <ManagerTableFilter label="Nhóm" value={kind} onChange={value => update('kind', value === 'all' ? '' : value)}
            options={[[ 'all', 'Tất cả' ], ...workKinds.map(value => [value, workName(value)] as [string, string])]} />
          <ManagerTableFilter label="Phân công" value={assignment} onChange={value => update('assignment', value === 'all' ? '' : value)}
            options={[[ 'all', 'Tất cả' ], ['unassigned', 'Chưa phân công'], ['attention', 'Cần giao / đổi người'], ['assigned', 'Đã phân công']]} />
          <ManagerTableFilter label="Nhân viên" value={assignee} onChange={value => update('assignee', value)}
            options={[[ '', 'Tất cả' ], ...knownStaff]} />
          <ManagerTableFilter label="Trạng thái" value={status} onChange={value => update('status', value)}
            options={[[ 'active', 'Chưa hoàn tất' ], ['all', 'Tất cả'], ...statuses.map(value => [value, label(value)] as [string, string])]} />
        </>} />
      {selected && (
        <AssignmentDetail
          key={`${selected.kind}:${first(selected.row, "id")}`}
          task={selected}
          workloads={workloads}
          onClose={closeDetails}
          onAssigned={() => {
            closeDetails();
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
  workloads,
  onClose,
  onAssigned,
}: {
  task: Task;
  workloads: Map<string, number>;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const id = first(task.row, "id");
  const currentStaffId = first(task.row, 'assignedStaff.id');
  const currentStaffName = first(task.row, 'assignedStaff.fullName');
  const formId = useId();
  const [staffId, setStaffId] = useState('');
  const assignable = canAssign(task);
  const destination = task.kind === 'damage-claims'
    ? `/manager/damage-claims?claim=${encodeURIComponent(id)}`
    : `/manager/operations/${task.kind}/${encodeURIComponent(id)}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || !assignable || !staffId || staffId === currentStaffId) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/manager/${task.kind}/${encodeURIComponent(id)}/assign`,
        "PATCH",
        { staffUserId: staffId.trim(), ...(task.kind === 'appointments' ? { expectedAssignedStaffUserId: first(task.row, 'assignedStaff.id') || null } : {}) },
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
    <Modal title={assignable ? 'Phân công nhân viên' : 'Chi tiết phân công'} onClose={onClose} busy={busy}
      className="assignment-dialog" footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>{assignable ? 'Hủy' : 'Đóng'}</button>
        {assignable && <button type="submit" form={formId} className="button-primary" disabled={busy || !staffId || staffId === currentStaffId}>
          {busy ? 'Đang lưu…' : currentStaffId ? 'Xác nhận đổi nhân viên' : 'Xác nhận phân công'}
        </button>}
      </>}>
      <div className="assignment-overview">
        <div className="assignment-title"><strong>{first(task.row, 'subject') || workName(task.kind)}</strong><Status value={task.row.status} /></div>
        <Facts items={[
          ...(first(customer(task.row), 'fullName') ? [['Khách hàng', first(customer(task.row), 'fullName')]] as [string, string][] : []),
          ['Kho / Đặt thuê', relatedUnit(task.row)],
          ...(task.kind === 'appointments' && task.row.scheduledAt ? [['Giờ bàn giao', date(task.row.scheduledAt, true)]] as [string, string][] : []),
          ['Nhân viên hiện tại', currentStaffName || 'Chưa phân công'],
        ]} />
        <Link to={destination} className="portal-text-button" onClick={onClose}>Xem hồ sơ công việc</Link>
      </div>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      {assignable && <form id={formId} className="portal-form" onSubmit={assign}>
        <StaffPicker list value={staffId} onChange={value => { setStaffId(value); setError(''); }} workloads={workloads} disabled={busy} />
      </form>}
    </Modal>
  );
}
