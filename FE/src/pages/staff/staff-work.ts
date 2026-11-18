import type { ActivityState } from '../../activity/context';
import { first, rows, type Row } from '../../components/manager/portal-data';
import { activitySources, staffPriorityActivities } from '../../utils/activity';
import { recordIdentity } from '../../utils/record-identity';

export const staffActivitySources = activitySources('STAFF');
export const staffSourceNames = new Map(staffActivitySources.map(source => [source.kind, source.title]));

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

export function staffWorkItems(activity: ActivityState, userId?: string, entries = staffPriorityActivities(activity.entries)) {
  const records = new Map<string, Row>(Object.entries(activity.data).flatMap(([kind, rows]) =>
    rows.map(row => [`${kind}:${first(row, 'id')}`, row] as const)));
  return entries.map(entry => {
    const row = records.get(entry.id) ?? {};
    const identity = staffRecordIdentity(row, entry.kind);
    const status = first(row, 'status');
    const scheduledAt = first(row, 'scheduledAt');
    const dueAt = first(row, 'dueAt') || (entry.kind === 'appointments' && status === 'CONFIRMED' ? scheduledAt : '');
    const titles: Record<string, string> = {
      reservations: 'Kiểm tra yêu cầu đặt kho',
      appointments: status === 'REQUESTED' ? 'Xác nhận lịch bàn giao' : 'Bàn giao kho',
      'stock-movements': row.type === 'OUT' ? 'Kiểm đếm hàng xuất' : 'Kiểm đếm hàng nhập',
      returns: status === 'REQUESTED' ? 'Tiếp nhận trả kho' : 'Kiểm tra kho trả',
      transfers: 'Bàn giao kho chuyển',
      'support-requests': 'Xử lý yêu cầu hỗ trợ',
      maintenance: 'Thực hiện bảo trì',
      'damage-claims': 'Kiểm tra sự cố hàng hóa',
    };
    return {
      entry, status, scheduledAt, title: titles[entry.kind] ?? staffSourceNames.get(entry.kind) ?? 'Xử lý hồ sơ',
      customer: identity.person || first(row, 'fullName'),
      unit: identity.location || first(row, 'unitCodeSnapshot'),
      priority: first(row, 'priority'),
      timestamp: dueAt || scheduledAt || entry.at,
      overdue: Boolean(dueAt) && Date.parse(dueAt) < activity.checkedAt,
      assigned: Boolean(userId) && first(row, 'assignedStaff.id') === userId,
    };
  });
}
