import type { ActivityState } from '../../activity/context';
import { first, object, type Row } from '../../components/manager/portal-data';
import { activitySources } from '../../utils/activity';
import { recordIdentity } from '../../utils/record-identity';
import { physicalUnitLabel } from '../../utils/physical-units';
import { transferProblem } from '../../utils/transfer-problem';
import { isAssignedStaffWork, needsStaffAssignment, staffNeedsAction, staffRecordedAt } from '../../utils/work-queue';

export const missedScheduleHelp = 'Việc có lịch hẹn đã đến giờ và vẫn chờ nhân viên xử lý.';

export const staffActivitySources = activitySources('FACILITY_STAFF').filter(source => needsStaffAssignment(source.kind));
export const staffSourceNames = new Map(staffActivitySources.map(source => [source.kind, source.title]));
export const staffInProgress = (status: string) => ['IN_PROGRESS', 'CONTACTED', 'IN_REVIEW', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'INVESTIGATING'].includes(status);

export function staffActivityReady(activity: ActivityState, kind: string) {
  return Boolean(activity.data[kind]) && !activity.failed.includes(staffSourceNames.get(kind) ?? '')
    && !activity.failed.includes('Kết nối mạng');
}

export function staffRecordIdentity(row: Row, resource: string) {
  const identity = recordIdentity(row, resource);
  return { ...identity, location: physicalUnitLabel(row, resource) || (resource === 'maintenance' ? identity.location : '') };
}

export function staffWorkItems(activity: ActivityState, userId?: string, includeHistory = false) {
  if (!userId) return [];
  const now = activity.checkedAt;
  const records = new Map<string, Row>(Object.entries(activity.data).flatMap(([kind, rows]) =>
    rows.map(row => [`${kind}:${first(row, 'id')}`, row] as const)));
  const entries = activity.entries.filter(entry => {
    const row = records.get(entry.id);
    if (!row || !staffSourceNames.has(entry.kind)) return false;
    const assigned = isAssignedStaffWork(entry.kind, row, userId);
    if (includeHistory && staffRecordedAt(entry.kind, row, userId)) return true;
    if (!assigned) return includeHistory && !entry.action && first(row, 'completedBy.id', 'resolvedBy.id') === userId;
    if (first(row, 'assignedStaff.accountStatus') === 'DISABLED') return false;
    const role = first(row, 'assignedStaff.role');
    return (!role || role === 'FACILITY_STAFF') &&
      (entry.kind !== 'support-requests' || !entry.web.startsWith('/staff/transfers/'));
  });
  return entries.map(entry => {
    const row = records.get(entry.id)!;
    const identity = staffRecordIdentity(row, entry.kind);
    const status = first(row, 'status');
    const recordedAt = includeHistory ? staffRecordedAt(entry.kind, row, userId) : '';
    const recovery = entry.kind === 'appointments' && row.canRecordCancellationRecovery === true && row.recoveryStaffId === userId;
    const phase = recovery ? 'ASSIGNED' : row.waitingForManager === true ? 'WAITING' : first(row, 'coordination.phase');
    const waitReason = row.waitingForManager === true ? 'MANAGER' : first(row, 'coordination.waitReason');
    const scheduledAt = recovery ? '' : first(row, 'scheduledAt', 'inspectionScheduledAt', 'transferRequestedSchedule.startAt');
    const dueAt = first(row, 'dueAt') || scheduledAt;
    const blocked = !recovery && entry.kind === 'appointments' && ['REQUESTED', 'CONFIRMED'].includes(status)
      && (row.bookingReady === false || object(row.handoverReadiness).allowed === false);
    const transferPending = entry.kind === 'transfers' && transferProblem(row).pending;
    const waiting = phase === 'WAITING' || transferPending || entry.kind === 'support-requests' && status === 'ESCALATED'
      || entry.kind === 'maintenance' && status === 'AWAITING_VERIFICATION';
    const actionable = !blocked && !waiting && entry.action
      && (entry.kind === 'damage-claims' || staffNeedsAction(entry.kind, row, userId));
    const processed = Boolean(recordedAt) || !recovery && (phase === 'STAFF_DONE' || !entry.action && (['COMPLETED', 'RESOLVED'].includes(status)
      || entry.kind === 'maintenance' && status === 'AWAITING_VERIFICATION'
      || entry.kind === 'returns' && Boolean(row.physicallyReturnedAt)
      || entry.kind === 'damage-claims' && Boolean(row.staffFacts)
      || entry.kind === 'transfers' && transferProblem(row).review.decision === 'CANCEL'
      || entry.kind === 'appointments' && first(row, 'scheduleAdjustment.action') === 'NO_SHOW'));
    const actualCompletionAt = first(row, 'physicallyReturnedAt', 'workCompletedAt', 'factsRecordedAt', 'resolvedAt', 'completedAt');
    const titles: Record<string, string> = {
      appointments: status === 'REQUESTED' ? 'Xác nhận lịch bàn giao' : 'Bàn giao kho',
      returns: status === 'REQUESTED' ? 'Tiếp nhận trả kho' : 'Kiểm tra kho trả',
      transfers: 'Bàn giao kho chuyển',
      'support-requests': 'Xử lý yêu cầu hỗ trợ',
      maintenance: 'Thực hiện bảo trì',
      'damage-claims': 'Kiểm tra sự cố hàng hóa',
    };
    return {
      entry, status, phase, waitReason, scheduledAt, processed, blocked, waiting, actionable, actualCompletionAt, blockingReason: first(row, 'bookingBlockReason'),
      title: recovery ? 'Thu hồi quyền truy cập kho' : entry.kind === 'maintenance' && recordedAt && recordedAt === first(row, 'createdAt') ? 'Báo cáo sự cố' : titles[entry.kind] ?? staffSourceNames.get(entry.kind) ?? 'Xử lý hồ sơ',
      customer: identity.person || first(row, 'fullName'),
      unit: physicalUnitLabel(row, entry.kind),
      reference: first(row, 'reservation.reference'),
      contractCode: first(row, 'rentalContract.contractCode', 'contract.contractCode'),
      priority: first(row, 'priority'),
      facilityId: first(row, 'facility.id'),
      facilityName: first(row, 'facility.name'),
      finishedAt: recordedAt || first(row, 'physicallyReturnedAt', 'workCompletedAt', 'factsRecordedAt', 'resolvedAt', 'escalatedAt', 'completedAt',
        'handoverReport.problemReview.reviewedAt', 'scheduleAdjustment.at') || entry.at,
      timestamp: dueAt || scheduledAt || entry.at,
      overdue: actionable && !processed && Date.parse(scheduledAt) < now,
    };
  }).filter(task => includeHistory ? task.processed : task.actionable || task.blocked || task.waiting ||
    !task.processed && ['ASSIGNED', 'IN_PROGRESS'].includes(task.phase));
}

export function staffWorkPhase(task: ReturnType<typeof staffWorkItems>[number]) {
  if (task.blocked) return 'blocked';
  if (task.waiting) return 'waiting';
  if (task.processed) return 'completed';
  return task.phase === 'IN_PROGRESS' || !task.phase && staffInProgress(task.status) ? 'progress' : 'pending';
}
