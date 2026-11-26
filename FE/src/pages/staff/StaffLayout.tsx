import { CalendarClock, ClipboardList, History, ShieldAlert } from 'lucide-react';
import { InternalPortalLayout, type InternalNavItem } from '../../components/layout/InternalPortalLayout';
import { staffNavigation } from '../../components/manager/operations-navigation';
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import type { WorkspaceSection } from '../../components/workspace/WorkspaceSectionPage';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';

const staffItems = staffNavigation().filter(item => item.to !== '/staff/rentals');
const groups = [
  { key: 'intake', title: 'Tiếp nhận yêu cầu' },
  { key: 'handover', title: 'Giao nhận & thay đổi' },
  { key: 'storage', title: 'Tra cứu & bảo trì' },
];
export const staffSections: WorkspaceSection[] = groups.map(group => ({
  ...group,
  items: staffItems.filter(item => item.group === group.title),
}));
const menu: InternalNavItem[] = [
  ...staffItems.filter(item => item.end).map(item => ({ ...item, label: 'Tổng quan', group: 'Không gian làm việc', match: ['/staff/operations'] })),
  { to: '/staff/tasks', label: 'Công việc của tôi', icon: ClipboardList, group: 'Không gian làm việc' },
  { to: '/staff/schedule', label: 'Lịch của tôi', icon: CalendarClock, group: 'Không gian làm việc' },
  { to: '/staff/report-issue', label: 'Báo cáo sự cố', icon: ShieldAlert, group: 'Không gian làm việc' },
  { to: '/staff/history', label: 'Lịch sử công việc', icon: History, group: 'Không gian làm việc' },
];

export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={menu} pageNavigation={staffItems} themed /></OperationsWorkspace.Provider>;
}
