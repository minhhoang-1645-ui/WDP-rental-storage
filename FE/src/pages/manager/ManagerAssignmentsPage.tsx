import { ManagerTaskTable, ManagerTableSearch, ManagerTableFilter } from '../../components/manager/ManagerTaskTable';
import { useManagerTableParams } from '../../components/manager/manager-table-params';
import { WorkSummary } from '../../components/workspace/WorkSummary';
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
  object,
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
import { useApiResource } from '../../services/useApiResource';
import { ApiError } from '../../services/api';
import { StaffPicker } from '../../components/manager/StaffPicker';
import { staffFromWork } from '../../utils/staff';
import { assignmentNeedsAttention, assignmentWorkRank, canAssignWork } from '../../utils/work-queue';
import { transferProblem } from '../../utils/transfer-problem';
import { isTransferRequest } from '../../utils/transfer-request';
import { isEarlyReturnRequest } from '../../utils/early-return';
import { normalizeSearch } from '../../utils/notification-tools';
import { physicalUnitLabel } from '../../utils/physical-units';

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
const pageTitle = 'Điều phối công việc';
const workName = (kind: WorkKind) => workNames[kind];
const transferIntake = ({ kind, row }: Task) => kind === 'support-requests' && isTransferRequest(row);
const taskTitle = (task: Task) => transferIntake(task) ? 'Phiếu yêu cầu chuyển kho'
  : task.kind === 'transfers' ? 'Hồ sơ chuyển kho' : first(task.row, 'subject') || workName(task.kind);
const taskKey = (task: Task) => task.kind + ':' + first(task.row, 'id');
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
const canAssign = (task: Task) => !finished(task) && !transferIntake(task)
  && !(task.kind === 'appointments' && (task.row.schedulePendingManager === true || task.row.bookingReady === false))
  && !(task.kind === 'transfers' && transferProblem(task.row).pending)
  && canAssignWork(task.kind, task.row);
const canRelease = (task: Task) => {
  const { row, kind } = task;
  if (!canAssign(task) || !first(row, 'assignedStaff.id') || !['ASSIGNED', 'WAITING'].includes(phase(task))) return false;
  switch (kind) {
    case 'appointments': return !rows(row.unitHandoverProgress).length;
    case 'returns': return row.status === 'REQUESTED' && !row.inspectionStartedAt;
    case 'support-requests': return ['OPEN', 'ASSIGNED'].includes(String(row.status)) && !row.startedAt;
    case 'maintenance': return row.status === 'OPEN' && !row.startedAt;
    case 'damage-claims': return !row.staffFacts;
    case 'transfers': {
      const report = object(row.handoverReport);
      return !row.closurePlanId && (!row.handoverReport || report.stagedHandover === true && Object.keys(report).length === 1);
    }
  }
};
const managerOnly = ({ kind, row }: Task) => ['maintenance', 'damage-claims'].includes(kind)
  || kind === 'support-requests' && (row.status === 'ESCALATED'
    || Boolean(row.category && !['LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'UNIT_ISSUE', 'OTHER'].includes(String(row.category))))
  || kind === 'transfers' && (row.reason === 'OPERATIONAL_RELOCATION' || Boolean(row.closurePlanId));
const relatedUnit = ({ row, kind }: Task) => physicalUnitLabel(row, kind);

export function ManagerAssignmentsPage() {
  const { user } = useAuth();
  const { params, page, limit, update } = useManagerTableParams();
  const [revision, setRevision] = useState(0);
  const queue = useApiResource<{ items: { kind: string; id: string }[];
    changes: { kind: string; id: string; selfClaimedBy?: string; managerAssignedTo?: string; exception?: string }[] }>(
    '/manager/assignment-queue', user?.id ?? '', true);
  const refreshQueue = queue.refresh;
  const refresh = useCallback(() => { refreshQueue(); setRevision(value => value + 1); }, [refreshQueue]);
  useLiveRefresh('/manager/*', refresh);
  const [manualSelection, setSelected] = useState<{ task: Task; intent: 'assign' | 'release' | 'exception' }>();
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
        .filter(row => !(kind === 'support-requests' && isEarlyReturnRequest(row)))
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
  const ready = new Set(queue.data?.items?.map(item => item.kind + ':' + item.id));
  const coordination = new Map(queue.data?.changes?.map(item => [item.kind + ':' + item.id, item]));
  const queueKnown = Boolean(queue.data && !queue.error);
  const exceptionFor = (task: Task) => ['STAFF_DONE', 'COMPLETED'].includes(phase(task)) ? undefined : coordination.get(taskKey(task))?.exception;
  const work = allTasks.map(task => {
    const staffId = first(task.row, 'assignedStaff.id');
    const assigned = Boolean(staffId);
    const done = finished(task);
    const exception = exceptionFor(task);
    const reason = first(task.row, 'coordination.waitReason');
    const linkedTransfer = transferIntake(task) && rows(task.row.transfers).find(row => first(row, 'id'));
    const waiting = !done && (Boolean(exception) || phase(task) === 'WAITING' || Boolean(reason));
    const pendingIntake = transferIntake(task) && !linkedTransfer && !done;
    const manager = !done && (Boolean(exception) || reason === 'MANAGER' || task.row.waitingForManager === true || pendingIntake
      || assigned && assignmentNeedsAttention(task.kind, task.row) || !assigned && managerOnly(task));
    const queued = !done && !assigned && queueKnown && ready.has(taskKey(task));
    const origin = coordination.get(taskKey(task));
    const assignedLabel = origin?.selfClaimedBy === staffId ? 'Staff đã tự nhận'
      : origin?.managerAssignedTo === staffId ? 'Quản lý đã phân công' : 'Đã có người phụ trách';
    return { task, assigned, assignedLabel, done, exception, reason, linkedTransfer, waiting, manager, queued };
  });
  const factsByTask = new Map(work.map(facts => [taskKey(facts.task), facts]));
  const quick = params.get('queue') ?? '';
  const openWork = work.filter(facts => !facts.done);
  const count = (predicate: (facts: (typeof work)[number]) => boolean, needsQueue = false) =>
    current?.tasks && (!needsQueue || queueKnown) ? openWork.filter(predicate).length : undefined;
  const search = params.get("search") ?? "";
  const kind = params.get("kind") ?? "all";
  const record = params.get("record");
  const selectedId = manualSelection ? first(manualSelection.task.row, 'id') : record;
  const selectedKind = manualSelection?.task.kind ?? kind;
  const selected = selectedId ? allTasks.find(task =>
    task.kind === selectedKind && first(task.row, 'id') === selectedId) : undefined;
  const assignment = params.get("assignment") ?? "all";
  const scope = params.get('scope') ?? 'active';
  const assignee = params.get('assignee') ?? '';
  const status = params.get('status') ?? scope;
  const order = params.get('sort') ?? '';
  const workPhase = quick ? '' : params.get('workPhase') ?? '';
  const taskDate = ({ row }: Task) => first(row, 'scheduledAt', 'inspectionScheduledAt', 'transferRequestedSchedule.startAt', 'requestedAt', 'createdAt');
  const tasks = allTasks.filter((task) => {
    const { assigned, queued, manager } = factsByTask.get(taskKey(task))!;
    if (quick === 'ready' && !queued || quick === 'manager' && !manager || quick === 'assigned' && (!assigned || finished(task))) return false;
    const scheduled = Date.parse(first(task.row, 'scheduledAt', 'inspectionScheduledAt', 'transferRequestedSchedule.startAt', 'dueAt'));
    const overdue = !finished(task) && Number.isFinite(scheduled) && scheduled < Date.now();
    return (
      (kind === "all" || task.kind === kind) && (!workPhase || (exceptionFor(task) ? 'WAITING' : phase(task)) === workPhase) &&
      (!assignee || first(task.row, "assignedStaff.id") === assignee) &&
      (status === 'all' || (status === 'active' ? !finished(task) : status === 'finished' ? finished(task) : status === 'overdue' ? overdue : task.row.status === status)) &&

      (quick || assignment === "all" ||
        (assignment === "attention" ? assignmentNeedsAttention(task.kind, task.row) : assignment === "assigned" ? assigned : !assigned)) &&
      normalizeSearch([
        code(task.row), taskTitle(task),
        relatedUnit(task),
        first(task.row, 'reservation.reference'),
        first(task.row, 'rentalContract.contractCode', 'contract.contractCode'),
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
    { key: 'task', label: 'Công việc', cell: task => {
      const { linkedTransfer } = factsByTask.get(taskKey(task))!;
      return <><strong>{taskTitle(task)}</strong><CopyRecordCode value={code(task.row)} showLabel={false} />
        {linkedTransfer && <Link className="assignment-related-record" to={workDetail({ kind: 'transfers', row: linkedTransfer })}>Hồ sơ chuyển kho {code(linkedTransfer)}</Link>}
      </>;
    } },
    { key: 'customer', label: 'Khách hàng / Kho', cell: task => {
      const name = first(customer(task.row), 'fullName');
      const unit = relatedUnit(task);
      return <><strong>{unit || name || '—'}</strong>{unit && name && <small>{name}</small>}</>;
    } },
    { key: 'staff', label: 'Người phụ trách', cell: task => {
      const { assigned, assignedLabel, waiting } = factsByTask.get(taskKey(task))!;
      return <>{first(task.row, 'assignedStaff.fullName') || (assigned ? 'Đã có người phụ trách' : '—')}
        {assigned && waiting && assignedLabel !== 'Đã có người phụ trách' && <small>{assignedLabel}</small>}</>;
    } },
    { key: 'date', label: 'Lịch hẹn / Ngày yêu cầu', sort: { direction: order === 'oldest' ? 'ascending' : order === 'newest' ? 'descending' : 'none', toggle: () => update('sort', order === 'newest' ? 'oldest' : 'newest') }, cell: task => date(taskDate(task), true) },
    { key: 'status', label: 'Trạng thái nghiệp vụ', cell: ({ row }) => <Status value={row.status} /> },
    { key: 'coordination', label: 'Điều phối', cell: task => {
      const { assigned, assignedLabel, done, exception, reason, linkedTransfer, waiting, manager, queued } = factsByTask.get(taskKey(task))!;
      const [tone, text] = done ? ['CANCELLED', 'REJECTED'].includes(String(task.row.status))
        ? ['cancelled', 'Đã kết thúc'] : ['completed', 'Đã xong phần nhân viên']
        : exception || task.row.waitingForManager === true ? ['pending', 'Chờ quản lý xử lý']
        : reason === 'CUSTOMER' ? ['pending', waitLabels.CUSTOMER]
        : task.kind === 'transfers' && task.row.status === 'REQUESTED' ? ['pending', 'Chờ phê duyệt phương án']
        : task.kind === 'appointments' && task.row.status === 'REQUESTED' && reason === 'MANAGER' ? ['pending', 'Chờ xác nhận lịch hẹn']
        : reason ? ['pending', waitLabels[reason] || 'Đang chờ']
        : queued ? ['open', 'Chờ Staff tiếp nhận']
        : assigned ? ['assigned', assignedLabel]
        : linkedTransfer ? ['in_progress', 'Đã lập hồ sơ chuyển kho']
        : manager ? ['pending', canAssign(task) ? 'Cần quản lý phân công' : 'Chờ quản lý xử lý']
        : waiting || phase(task) === 'UNASSIGNED' ? ['pending', phaseLabels[phase(task)]] : ['', ''];
      return <>{text ? <Status value={tone} text={text} /> : '—'}
        {assigned && assignmentNeedsAttention(task.kind, task.row) && <small>Cần đổi người phụ trách</small>}</>;
    } },
    { key: 'action', label: 'Thao tác', cell: task => {
      const { assigned, manager, exception } = factsByTask.get(taskKey(task))!;
      return <div className="work-row-actions">
        {exception && <button type="button" className="button-primary" onClick={() => setSelected({ task, intent: 'exception' })}>Xử lý vướng mắc</button>}
        {canAssign(task) && <button type="button" className={exception ? 'button-secondary' : 'button-primary'} onClick={() => setSelected({ task, intent: 'assign' })}>{assigned ? 'Đổi người phụ trách' : 'Phân công'}</button>}
        {!exception && canRelease(task) && <button type="button" className="button-secondary" onClick={() => setSelected({ task, intent: 'release' })}>Đưa về hàng chờ</button>}
        <Link className="button-secondary" to={workDetail(task)}>{manager && !canAssign(task) && !exception ? 'Xem hồ sơ cần xử lý' : 'Xem chi tiết'}</Link>
      </div>;
    } },
  ];

  return (
    <section className="manager-assignments">
      <PageHeader title={pageTitle}>
        {<button type="button" className="button-secondary" disabled={!current || refreshing} onClick={refresh}><RefreshCw size={16} /> Làm mới</button>}
      </PageHeader>
      <>
      {queue.error && <p className="booking-alert is-error" role="alert">Chưa tải được trạng thái hàng chờ. Hãy làm mới để đối chiếu.</p>}
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <WorkSummary metrics={[
        { label: 'Chờ Staff tiếp nhận', value: queueKnown ? ready.size : undefined },
        { label: 'Cần quản lý xử lý', value: count(facts => facts.manager, true) },
        { label: 'Đã có người phụ trách', value: count(facts => facts.assigned) },
        { label: 'Đang chờ phản hồi', value: count(facts => facts.reason === 'CUSTOMER' || facts.reason === 'MANAGER' || Boolean(facts.exception), true) },
      ]} />
      <div className="work-view-switch" role="group" aria-label="Lọc nhanh theo điều phối">
        {([['', 'Tất cả'], ['ready', 'Chờ tiếp nhận'], ['manager', 'Cần quản lý'], ['assigned', 'Đã có người phụ trách']] as const).map(([value, text]) =>
          <button key={value} type="button" aria-pressed={quick === value} onClick={() => setParams(previous => {
            const next = new URLSearchParams(previous);
            for (const key of ['page', 'assignment', 'workPhase', 'status', 'scope']) next.delete(key);
            if (value === 'ready') next.delete('assignee');
            if (value) next.set('queue', value); else next.delete('queue');
            return next;
          }, { replace: true })}>{text}</button>)}
      </div>
      <ManagerTaskTable title={pageTitle} columns={columns} loading={!current} refreshing={refreshing} error={current?.error} retry={refresh}
        items={tasks.slice((visiblePage - 1) * limit, visiblePage * limit)} rowDetail={task => ({ to: workDetail(task), label: `Mở hồ sơ công việc ${code(task.row)}` })} rowKey={task => task.kind + ':' + first(task.row, 'id')}
        emphasized={task => factsByTask.get(taskKey(task))!.manager || task.row.priority === 'HIGH'}
        page={visiblePage} limit={limit} total={tasks.length} update={update}
        emptyTitle={quick === 'ready' && !queueKnown ? 'Chưa xác định được hàng chờ' : 'Không tìm thấy công việc phù hợp'}
        toolbar={<div className="manager-assignment-filters">
          <ManagerTableSearch value={search} onChange={value => update('search', value)} placeholder="Mã, kho hoặc nhân viên…" />
          <ManagerTableFilter label="Loại công việc" value={kind} onChange={value => update('kind', value === 'all' ? '' : value)}
            options={[[ 'all', 'Tất cả' ], ...workKinds.map(value => [value, workName(value)] as [string, string])]} />
          <ManagerTableFilter label="Trạng thái nghiệp vụ" value={status} onChange={value => update('status', value)}
            options={[[ 'active', 'Chưa hoàn tất' ], ['overdue', 'Quá lịch hẹn'], ...(!quick ? [['finished', 'Đã kết thúc'], ['all', 'Tất cả']] as [string, string][] : []), ...statuses.map(value => [value, label(value)] as [string, string])]} />
          {!quick && <ManagerTableFilter label="Trạng thái điều phối" value={workPhase} onChange={value => update('workPhase', value)}
            options={[[ '', 'Tất cả' ], ...Object.entries(phaseLabels)]} />}
          {quick !== 'ready' && <ManagerTableFilter label="Nhân viên phụ trách" value={assignee} onChange={value => update('assignee', value)}
            options={[[ '', 'Tất cả' ], ...knownStaff]} />}
        </div>} />
      {selected && (
        <AssignmentDetail
          key={`${selected.kind}:${first(selected.row, "id")}`}
          task={selected}
          exception={manualSelection?.intent === 'assign' ? undefined : exceptionFor(selected)}
          intent={manualSelection?.intent ?? (exceptionFor(selected) ? 'exception' : 'assign')}
          workloads={workloads}
          onClose={closeDetails}
          onReload={() => {
            closeDetails();
            refresh();
          }}
          onAssigned={message => {
            closeDetails();
            setNotice(message);
            refresh();
          }}
        />
      )}
      </>
    </section>
  );
}

function AssignmentDetail({
  task,
  exception,
  intent,
  workloads,
  onClose,
  onReload,
  onAssigned,
}: {
  task: Task;
  exception?: string;
  intent: 'assign' | 'release' | 'exception';
  workloads: Map<string, number>;
  onClose: () => void;
  onReload: () => void;
  onAssigned: (message: string) => void;
}) {
  const id = first(task.row, "id");
  const currentStaffId = first(task.row, 'assignedStaff.id');
  const currentStaffName = first(task.row, 'assignedStaff.fullName');
  const formId = useId();
  const [queueReason, setQueueReason] = useState('');
  const requiresHandoff = Boolean(currentStaffId && (task.kind === 'appointments' && (phase(task) === 'IN_PROGRESS' || rows(task.row.unitHandoverProgress).length)
    || task.kind === 'returns' && (phase(task) === 'IN_PROGRESS' || task.row.inspectionStartedAt)
    || task.kind === 'maintenance' && phase(task) === 'IN_PROGRESS'
    || task.kind === 'transfers' && first(task.row, 'handoverReport.destinationAccessDeliveredAt')));
  const [staffId, setStaffId] = useState('');
  const assignable = intent === 'assign' && canAssign(task) && !exception;
  const releasable = intent === 'release' && canRelease(task);
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
    const handoff = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/manager/${task.kind}/${encodeURIComponent(id)}/assign`,
        "PATCH",
        { staffUserId: staffId.trim(), expectedAssignedStaffUserId: currentStaffId || null,
          ...(requiresHandoff ? { handoverConfirmed: handoff.get('handoverConfirmed') === 'on', handoverNote: handoff.get('handoverNote') } : {}) },
        true,
      );
      onAssigned('Đã cập nhật người phụ trách.');
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
    if (lock.current || stale || !releasable || !queueReason.trim()) return;
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
      onAssigned('Đã bỏ phân công. Việc đủ điều kiện sẽ xuất hiện trong hàng chờ.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
      setError(caught instanceof Error ? caught.message : 'Không thể đưa việc về hàng chờ.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const resume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current || stale) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (!reason) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(`/manager/assignment-queue/${task.kind}/${encodeURIComponent(id)}/resume`, 'PATCH', { reason });
      onAssigned('Đã cho tiếp tục xử lý công việc.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
      setError(caught instanceof Error ? caught.message : 'Không thể cho tiếp tục xử lý.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title={exception ? 'Xử lý vướng mắc' : releasable ? 'Đưa về hàng chờ' : assignable ? currentStaffId ? 'Đổi người phụ trách' : 'Phân công nhân viên' : 'Chi tiết điều phối'} onClose={close} busy={busy}
      className="assignment-dialog" footer={<>
        <button type="button" className="button-secondary" disabled={busy} onClick={close}>{assignable ? 'Hủy' : 'Đóng'}</button>
        {stale ? <button type="button" className="button-primary" onClick={onReload}>Tải lại phân công</button>
        : assignable && <button type="submit" form={formId} className="button-primary" disabled={busy || !staffId || staffId === currentStaffId}>
          {busy ? 'Đang lưu…' : currentStaffId ? 'Xác nhận đổi nhân viên' : 'Xác nhận phân công'}
        </button>}
      </>}>
      <div className="assignment-overview">
        <div className="assignment-title"><strong>{taskTitle(task)}</strong><Status value={task.row.status} /></div>
        <Facts items={[
          ...(first(customer(task.row), 'fullName') ? [['Khách hàng', first(customer(task.row), 'fullName')]] as [string, string][] : []),
          ['Mã kho', relatedUnit(task) || '—'],
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
        {requiresHandoff && <>
          <label className="portal-checkbox"><input name="handoverConfirmed" type="checkbox" required />Đã chuyển giao công việc thực tế cho người mới</label>
          <label className="field-label">Ghi chú chuyển giao<textarea name="handoverNote" required minLength={3} maxLength={1000} /></label>
        </>}
      </form>}
      {exception && <section>
        <h3>Vướng mắc do nhân viên báo</h3><p>{exception}</p>
        <form className="portal-form" onSubmit={resume}>
          <label className="field-label">Kết quả xử lý<textarea name="reason" required maxLength={500} /></label>
          <button type="submit" className="button-secondary" disabled={busy || stale}>Cho tiếp tục xử lý</button>
        </form>
      </section>}
      {releasable && <section>
        <form className="portal-form" onSubmit={release}>
          <label className="field-label">Lý do<input required maxLength={500} value={queueReason} onChange={event => setQueueReason(event.target.value)} /></label>
          <button type="submit" className="button-secondary" disabled={busy || stale}>Đưa về hàng chờ</button>
        </form>
      </section>}
    </Modal>
  );
}
