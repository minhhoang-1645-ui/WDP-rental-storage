import { useMemo, type MouseEvent } from 'react';
import { activityText, type ActivityData, type ActivityEntry } from '../utils/activity';
import { assignmentNeedsAttention } from '../utils/work-queue';
import { isEarlyReturnRequest } from '../utils/early-return';
import { useActivity } from './context';

export type NotificationRole = 'STAFF' | 'MANAGER' | 'ADMIN' | 'CUSTOMER';
type OperationalRole = Extract<NotificationRole, 'STAFF' | 'MANAGER'>;

export function isCompactNotificationRole(role?: NotificationRole) {
  return role === 'ADMIN' || role === 'CUSTOMER';
}

export function workspaceInboxPath(role: NotificationRole) {
  return `/${role.toLowerCase()}/notifications`;
}

export function workspaceNotificationLink(role: NotificationRole, item: ActivityEntry, markRead: (tokens: string[]) => void) {
  const inbox = workspaceInboxPath(role);
  const hasTarget = item.web !== inbox;
  return {
    to: item.web,
    state: hasTarget && role !== 'ADMIN' ? { notificationInbox: inbox } : undefined,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
      if (hasTarget) markRead([item.token]);
      return true;
    },
  };
}

function forStaff(entry: ActivityEntry, row: Record<string, unknown>, userId: string) {
  if (entry.kind === 'support-requests' && isEarlyReturnRequest(row)) return false;
  const assignee = activityText(row, 'assignedStaff.id') || activityText(row, 'assignedStaffId');
  if (assignee) return assignee === userId;
  if (['stock-movements', 'support-requests', 'maintenance'].includes(entry.kind)) return false;
  return entry.action || activityText(row, 'completedBy.id') === userId;
}

function forManager(entry: ActivityEntry, row: Record<string, unknown>) {
  if (['deposit-settlements', 'invoices'].includes(entry.kind)) return true;
  if (entry.kind === 'support-requests') {
    return isEarlyReturnRequest(row) || assignmentNeedsAttention(entry.kind, row) ||
      row.status === 'ESCALATED' || activityText(row, 'resolvedBy.role') === 'MANAGER';
  }
  if (entry.kind === 'maintenance') return assignmentNeedsAttention(entry.kind, row) || row.status === 'AWAITING_VERIFICATION' || Boolean(row.verifiedAt);
  if (entry.kind === 'stock-movements') return assignmentNeedsAttention(entry.kind, row) || Boolean(activityText(row, 'assignedBy.id'));
  return entry.action || entry.kind === 'damage-claims' && row.status === 'RESOLVED';
}

function workspaceTarget(role: OperationalRole, entry: ActivityEntry, row: Record<string, unknown>) {
  const id = activityText(row, 'id');
  if (!id) return workspaceInboxPath(role);
  const encoded = encodeURIComponent(id);
  if (role === 'STAFF') {
    return entry.kind === 'support-requests' && !entry.web.startsWith('/staff/transfers/') ? `/staff/support-requests/${encoded}` : entry.web;
  }
  switch (entry.kind) {
    case 'damage-claims': return `/manager/damage-claims?claim=${encoded}`;
    case 'support-requests':
      if (isEarlyReturnRequest(row)) return `/manager/early-returns?record=${encoded}`;
      break;
  }
  if (assignmentNeedsAttention(entry.kind, row)) {
    return `/manager/assignments?${new URLSearchParams({ kind: entry.kind, record: id })}`;
  }
  return `/manager/operations/${entry.kind}/${encoded}`;
}

function customerEntry(userId: string, entry: ActivityEntry, row: Record<string, unknown>): ActivityEntry | undefined {
  const get = (key: string) => activityText(row, key);
  const id = encodeURIComponent(get('id'));
  const owners = ['customerId', 'customer.id', 'reservation.customerId', 'reservation.customer.id', 'invoice.customerId', 'invoice.customer.id'].map(get).filter(Boolean);
  if (owners.some(owner => owner !== userId) || !entry.web.startsWith('/customer/')) return;
  const unit = get('storageUnit.unitCode') || get('unit.unitCode') || get('unitCodeSnapshot') || get('reservation.storageUnit.unitCode');
  const storage = get('storageType.name') || get('product.name') || get('reservation.storageType.name');
  let web = entry.web;
  if (entry.kind === 'contracts' && web === '/customer/contracts') web += `?contract=${id}`;
  if (entry.kind === 'renewals' && web === '/customer/renewals') web += `?renewal=${id}`;
  const summary = [storage, unit].filter(Boolean).join(' · ');
  return { ...entry, web, message: summary || (entry.kind === 'support-requests' ? get('subject') : '') };
}

function workspaceEntries(role: NotificationRole, userId: string, data: ActivityData, entries: ActivityEntry[]) {
  if (role === 'ADMIN') return entries;
  const records = new Map<string, Record<string, unknown>>(
    Object.entries(data).flatMap(([kind, rows]) => rows.map(row => [`${kind}:${activityText(row, 'id')}`, row] as const)),
  );
  return entries.flatMap(entry => {
    const row = records.get(entry.id);
    if (!row) return [];
    if (role === 'CUSTOMER') {
      const item = customerEntry(userId, entry, row);
      return item ? [item] : [];
    }
    if (!(role === 'STAFF' ? forStaff(entry, row, userId) : forManager(entry, row))) return [];
    const target = workspaceTarget(role, entry, row);
    const root = `/${role.toLowerCase()}/`;
    return [{ ...entry, web: target.startsWith(root) ? target : workspaceInboxPath(role) }];
  });
}

export function useWorkspaceNotifications(role?: NotificationRole, userId = '') {
  const activity = useActivity();
  const { data, entries: allEntries, read } = activity;
  // The current backend exposes role-scoped work records. Read receipts belong to ActivityProvider on this browser.
  const entries = useMemo(() => role && userId ? workspaceEntries(role, userId, data, allEntries) : role ? [] : allEntries,
    [role, userId, data, allEntries]);
  const unread = useMemo(() => {
    const seen = new Set(read);
    return new Set(entries.filter(item => !seen.has(item.token)).map(item => item.token));
  }, [entries, read]);
  return { activity, entries, unread };
}
