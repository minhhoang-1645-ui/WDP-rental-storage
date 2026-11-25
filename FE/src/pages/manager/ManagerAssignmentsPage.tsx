import { ManagerTaskTable, ManagerTableSearch, ManagerTableFilter } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import type { StaffColumn } from '../../components/workspace/StaffTaskTable';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLiveRefresh } from '../../services/live-events';
import { RefreshCw } from "lucide-react";
import { useSearchParams } from 'react-router-dom';
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
import { ApiError } from '../../services/api';
import { StaffPicker } from '../../components/manager/StaffPicker';
import { staffFromWork } from '../../utils/staff';
import { assignmentNeedsAttention, assignmentWorkRank, canAssignWork } from '../../utils/work-queue';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { normalizeSearch } from '../../utils/notification-tools';

const workNames = {
  'support-requests': 'Hỗ trợ',
  maintenance: 'Bảo trì',
  appointments: 'Lịch bàn giao',
  returns: 'Trả kho',
  transfers: 'Chuyển kho',
  'damage-claims': 'Sự cố hàng hóa',
};
type WorkKind = keyof typeof workNames;
type Task = { kind: WorkKind; row: Row };
const workKinds = Object.keys(workNames) as WorkKind[];
const workName = (kind: WorkKind) => workNames[kind];
const workDetail = ({ kind, row }: Task) => {
  const id = encodeURIComponent(first(row, 'id'));
  return kind === 'damage-claims' ? `/manager/damage-claims?claim=${id}` : `/manager/operations/${kind}/${id}`;
};
const phaseLabels: Record<string, string> = {
  UNASSIGNED: 'Chờ phân công', ASSIGNED: 'Đã giao, chưa bắt đầu', IN_PROGRESS: 'Đang thực hiện',
  WAITING: 'Đang chờ', STAFF_DONE: 'Đã xong phần Staff',
};
const waitLabels: Record<string, string> = {
  CUSTOMER: 'Chờ khách hàng', MANAGER: 'Chờ quản lý', SCHEDULE: 'Chưa đến giờ hẹn',
  SAFETY: 'Chờ xác nhận an toàn ô kho', RENTAL_REQUIREMENTS: 'Chờ đủ điều kiện bàn giao',
};
const phase = (task: Task) => first(task.row, 'coordination.phase');
const finished = (task: Task) => phase(task) ? phase(task) === 'STAFF_DONE' : ['COMPLETED', 'RESOLVED', 'CANCELLED', 'REJECTED', 'PENDING_SETTLEMENT'].includes(String(task.row.status));
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
  const [, setParams] = useSearchParams();
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
          !(kind === 'transfers' && row.status === 'REJECTED'))
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
  const selectedId = manualSelection ? first(manualSelection.row, 'id') : record;
  const selectedKind = manualSelection?.kind ?? kind;
  const selected = selectedId ? allTasks.find(task =>
    task.kind === selectedKind && first(task.row, 'id') === selectedId) : undefined;
  const assignment = params.get("assignment") ?? "all";
  const scope = params.get('scope') ?? 'active';
  const assignee = params.get('assignee') ?? '';
  const status = params.get('status') ?? scope;
  const order = params.get('sort') ?? '';
  const workPhase = params.get('workPhase') ?? '';
  const taskDate = ({ row }: Task) => first(row, 'requestedAt', 'createdAt');
  const tasks = allTasks.filter((task) => {
    const assigned = Boolean(first(task.row, "assignedStaff.id"));
    const scheduled = Date.parse(first(task.row, 'scheduledAt', 'dueAt'));
    const overdue = !finished(task) && Number.isFinite(scheduled) && scheduled < Date.now();
    return (
      (kind === "all" || task.kind === kind) && (!workPhase || phase(task) === workPhase) &&
      (!assignee || first(task.row, "assignedStaff.id") === assignee) &&
      (status === 'all' || (status === 'active' ? !finished(task) : status === 'finished' ? finished(task) : status === 'overdue' ? overdue : task.row.status === status)) &&

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
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(tasks.length / limit)));
  const knownStaff = staffFromWork(allTasks.map(task => task.row));
  const workloads = new Map<string, number>();
  for (const task of allTasks) { const staffId = first(task.row, 'assignedStaff.id'); if (staffId && phase(task) === 'IN_PROGRESS') workloads.set(staffId, (workloads.get(staffId) ?? 0) + 1); }
  const closeDetails = () => {
    setSelected(undefined);
    if (record) setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('record');
      return next;
    }, { replace: true });
  };
  const statuses = [...new Set(allTasks.map(task => first(task.row, 'status')).filter(Boolean))];
  const columns: StaffColumn<Task>[] = [
    { key: 'task', label: 'Công việc', cell: ({ kind, row }) => <><strong>{first(row, 'subject') || workName(kind)}</strong><CopyRecordCode value={code(row)} />{kind === 'appointments' && <small>Hẹn: {date(row.scheduledAt, true)}</small>}</> },
    { key: 'customer', label: 'Khách hàng / Kho', cell: ({ row }) => <><strong>{first(customer(row), 'fullName') || relatedUnit(row)}</strong>{first(customer(row), 'fullName') && <small>{relatedUnit(row)}</small>}<small>{first(row, 'facility.name', 'reservation.facility.name')}</small></> },
    { key: 'staff', label: 'Nhân viên phụ trách', cell: task => {
      const assigned = first(task.row, 'assignedStaff.fullName');
      return <><strong>{assigned || 'Chưa phân công'}</strong>
        {assigned && assignmentNeedsAttention(task.kind, task.row) && <small>Cần đổi nhân viên</small>}
        {canAssign(task) && <button type="button" className="portal-text-button manager-assign-trigger" onClick={() => setSelected(task)}>{assigned ? 'Đổi nhân viên' : 'Phân công'}</button>}
      </>;
    } },
    { key: 'date', label: 'Ngày yêu cầu', sort: { direction: order === 'oldest' ? 'ascending' : order === 'newest' ? 'descending' : 'none', toggle: () => update('sort', order === 'newest' ? 'oldest' : 'newest') }, cell: task => date(taskDate(task), true) },
    { key: 'status', label: 'Tình trạng công việc', cell: task => <>
      {phaseLabels[phase(task)] ? <strong>{phaseLabels[phase(task)]}</strong> : <Status value={task.row.status} />}
      {waitLabels[first(task.row, 'coordination.waitReason')] && <small>{waitLabels[first(task.row, 'coordination.waitReason')]}</small>}
    </> },
  ];

  return (
    <section className="manager-assignments">
      <PageHeader title="Phân công nhân viên">
        {<button type="button" className="button-secondary" disabled={!current || refreshing} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>}
      </PageHeader>
      <>
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <ManagerTaskTable title="Phân công nhân viên" columns={columns} loading={!current} refreshing={refreshing} error={current?.error} retry={refresh}
        items={tasks.slice((visiblePage - 1) * limit, visiblePage * limit)} rowDetail={task => ({ to: workDetail(task), label: `Mở hồ sơ công việc ${code(task.row)}` })} rowKey={task => task.kind + ':' + first(task.row, 'id')}
        emphasized={task => canAssign(task) && assignmentNeedsAttention(task.kind, task.row)}
        page={visiblePage} limit={limit} total={tasks.length} update={update}
        toolbar={<div className="manager-assignment-filters">
          <ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Mã, kho hoặc nhân viên…" />
          <ManagerTableFilter label="Trạng thái" value={status} onChange={value => update('status', value)}
            options={[[ 'active', 'Chưa hoàn tất' ], ['overdue', 'Quá lịch hẹn'], ['finished', 'Đã kết thúc'], ['all', 'Tất cả'], ...statuses.map(value => [value, label(value)] as [string, string])]} />
          <ManagerTableFilter label="Điều phối" value={workPhase} onChange={value => update('workPhase', value)}
            options={[[ '', 'Tất cả' ], ...Object.entries(phaseLabels)]} />
          <ManagerTableFilter label="Nhân viên" value={assignee} onChange={value => update('assignee', value)}
            options={[[ '', 'Tất cả' ], ...knownStaff]} />
          <details className="manager-assignment-filter-more" open={kind !== 'all' || assignment !== 'all' || undefined}>
            <summary>Loại công việc và phân công</summary>
            <div>
              <ManagerTableFilter label="Loại công việc" value={kind} onChange={value => update('kind', value === 'all' ? '' : value)}
                options={[[ 'all', 'Tất cả' ], ...workKinds.map(value => [value, workName(value)] as [string, string])]} />
              <ManagerTableFilter label="Phân công" value={assignment} onChange={value => update('assignment', value === 'all' ? '' : value)}
                options={[[ 'all', 'Tất cả' ], ['unassigned', 'Chưa phân công'], ['attention', 'Cần giao / đổi người'], ['assigned', 'Đã phân công']]} />
            </div>
          </details>
        </div>} />
      {selected && (
        <AssignmentDetail
          key={`${selected.kind}:${first(selected.row, "id")}`}
          task={selected}
          workloads={workloads}
          onClose={closeDetails}
          onReload={() => {
            closeDetails();
            setRevision(value => value + 1);
          }}
          onAssigned={() => {
            closeDetails();
            setNotice("Đã cập nhật nhân viên phụ trách.");
            setRevision((value) => value + 1);
          }}
        />
      )}
      </>
    </section>
  );
}

function AssignmentDetail({
  task,
  workloads,
  onClose,
  onReload,
  onAssigned,
}: {
  task: Task;
  workloads: Map<string, number>;
  onClose: () => void;
  onReload: () => void;
  onAssigned: () => void;
}) {
  const id = first(task.row, "id");
  const currentStaffId = first(task.row, 'assignedStaff.id');
  const currentStaffName = first(task.row, 'assignedStaff.fullName');
  const formId = useId();
  const [queueReason, setQueueReason] = useState('');
  const [staffId, setStaffId] = useState('');
  const assignable = canAssign(task);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const lock = useRef(false);
  const close = () => {
    if (lock.current) return;
    onClose();
  };
  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || stale || !assignable || !staffId || staffId === currentStaffId) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/manager/${task.kind}/${encodeURIComponent(id)}/assign`,
        "PATCH",
        { staffUserId: staffId.trim(), expectedAssignedStaffUserId: currentStaffId || null },
        true,
      );
      onAssigned();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
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
  const release = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || stale || !currentStaffId || !queueReason.trim()) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(
        `/manager/assignments/${task.kind}/${encodeURIComponent(id)}/release`,
        'PATCH',
        { expectedAssignedStaffUserId: currentStaffId, reason: queueReason.trim() },
        false,
      );
      onAssigned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đưa việc về hàng chờ.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title={assignable ? currentStaffId ? 'Đổi nhân viên' : 'Phân công nhân viên' : 'Chi tiết phân công'} onClose={close} busy={busy}
      className="assignment-dialog" footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={close}>{assignable ? 'Hủy' : 'Đóng'}</button>
        {stale ? <button type="button" className="button-primary" onClick={onReload}>Tải lại phân công</button>
        : assignable && <button type="submit" form={formId} className="button-primary" disabled={busy || !staffId || staffId === currentStaffId}>
          {busy ? 'Đang lưu…' : currentStaffId ? 'Xác nhận đổi nhân viên' : 'Xác nhận phân công'}
        </button>}
      </>}>
      <div className="assignment-overview">
        <div className="assignment-title"><strong>{first(task.row, 'subject') || workName(task.kind)}</strong><Status value={task.row.status} /></div>
        <Facts items={[
          ...(first(customer(task.row), 'fullName') ? [['Khách hàng', first(customer(task.row), 'fullName')]] as [string, string][] : []),
          ['Kho / Đặt thuê', relatedUnit(task.row)],
          ['Cơ sở', first(task.row, 'facility.name', 'reservation.facility.name') || '—'],
          ...(task.kind === 'appointments' && task.row.scheduledAt ? [['Giờ bàn giao', date(task.row.scheduledAt, true)]] as [string, string][] : []),
          ['Đang phụ trách', currentStaffName || 'Chưa phân công'],
        ]} />
        <Link to={workDetail(task)} className="portal-text-button" onClick={event => {
          if (lock.current) event.preventDefault();
        }}>Xem hồ sơ công việc</Link>
      </div>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      {assignable && <form id={formId} className="portal-form" onSubmit={assign}>
        <StaffPicker task={{kind:task.kind,id}} list value={staffId} onChange={value => { setStaffId(value); if (!stale) setError(''); }} workloads={workloads} disabled={busy || stale} />
      </form>}
      {currentStaffId && ['ASSIGNED', 'WAITING'].includes(phase(task)) && <details>
        <summary>Đưa về hàng chờ</summary>
        <form className="portal-form" onSubmit={release}>
          <label className="field-label">Lý do<input required maxLength={500} value={queueReason} onChange={event => setQueueReason(event.target.value)} /></label>
          <button type="submit" className="button-secondary" disabled={busy || stale}>Đưa về hàng chờ</button>
        </form>
      </details>}
    </Modal>
  );
}
