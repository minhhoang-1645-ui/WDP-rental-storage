import type { ActivityState } from '../../activity/context';
import { first, rows, type Row } from '../../components/manager/portal-data';
import { activitySources, staffPriorityActivities } from '../../utils/activity';
import { recordIdentity } from '../../utils/record-identity';
import { isAssignedStaffWork, needsStaffAssignment, staffNeedsAction } from '../../utils/work-queue';

export const staffActivitySources = activitySources('FACILITY_STAFF').filter(source => needsStaffAssignment(source.kind));
export const staffSourceNames = new Map(staffActivitySources.map(source => [source.kind, source.title]));
export const staffInProgress = (status: string) => ['IN_PROGRESS', 'CONTACTED', 'IN_REVIEW', 'INSPECTION_IN_PROGRESS', 'ISSUE_FOUND', 'INVESTIGATING'].includes(status);

export function staffActivityReady(activity: ActivityState, kind: string) {
  return Boolean(activity.data[kind]) && !activity.failed.includes(staffSourceNames.get(kind) ?? '')
    && !activity.failed.includes('Kết nối mạng');
}

export function staffRecordIdentity(row: Row, resource: string) {
  const identity = recordIdentity(row, resource);
  if (resource !== 'returns') return identity;
  const inspected = [...new Set(rows(row.inspections).map(item => first(item, 'unit.unitCode')).filter(Boolean))];
  return { ...identity, location: inspected.join(', ') || identity.location };
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
    if (!entry.action) return includeHistory && (assigned || first(row, 'completedBy.id', 'resolvedBy.id') === userId);
    if (!assigned || first(row, 'assignedStaff.accountStatus') === 'DISABLED') return false;
    const role = first(row, 'assignedStaff.role');
    return (!role || role === 'FACILITY_STAFF') &&
      (entry.kind === 'damage-claims' || staffNeedsAction(entry.kind, row, userId)) &&
      (entry.kind !== 'support-requests' || !entry.web.startsWith('/staff/transfers/'));
  });
  return (includeHistory ? entries : staffPriorityActivities(entries)).map(entry => {
    const row = records.get(entry.id)!;
    const identity = staffRecordIdentity(row, entry.kind);
    const status = first(row, 'status');
    const scheduledAt = first(row, 'scheduledAt');
    const dueAt = entry.kind === 'appointments' && status === 'CONFIRMED' ? scheduledAt : first(row, 'dueAt');
    const processed = !entry.action && (['COMPLETED', 'RESOLVED'].includes(status)
      || entry.kind === 'maintenance' && status === 'AWAITING_VERIFICATION'
      || entry.kind === 'support-requests' && status === 'ESCALATED'
      || entry.kind === 'returns' && Boolean(row.physicallyReturnedAt)
      || entry.kind === 'damage-claims' && Boolean(row.staffFacts));
    const titles: Record<string, string> = {
      appointments: status === 'REQUESTED' ? 'Xác nhận lịch bàn giao' : 'Bàn giao kho',
      returns: status === 'REQUESTED' ? 'Tiếp nhận trả kho' : 'Kiểm tra kho trả',
      transfers: 'Bàn giao kho chuyển',
      'support-requests': 'Xử lý yêu cầu hỗ trợ',
      maintenance: 'Thực hiện bảo trì',
      'damage-claims': 'Kiểm tra sự cố hàng hóa',
    };
    return {
      entry, status, scheduledAt, processed, title: titles[entry.kind] ?? staffSourceNames.get(entry.kind) ?? 'Xử lý hồ sơ',
      customer: identity.person || first(row, 'fullName'),
      unit: identity.location || first(row, 'unitCodeSnapshot'),
      priority: first(row, 'priority'),
      facilityId: first(row, 'facility.id'),
      facilityName: first(row, 'facility.name'),
      finishedAt: first(row, 'physicallyReturnedAt', 'workCompletedAt', 'factsRecordedAt', 'resolvedAt', 'escalatedAt', 'completedAt') || entry.at,
      timestamp: dueAt || scheduledAt || entry.at,
      overdue: Boolean(dueAt) && Date.parse(dueAt) < now,
    };
  });
}
