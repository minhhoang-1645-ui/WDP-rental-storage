import { ClipboardList } from 'lucide-react';
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
function section(group: string, destinations: Record<string, string>): InternalNavItem[] {
  return Object.entries(destinations).flatMap(([resource, label]) => {
    const item = staffItems.find(entry => entry.to === `/staff/${resource}`);
    if (!item) return [];
    return [{ ...item, label, group, match: [`/staff/operations/${resource}`] }];
  });
}

const menu: InternalNavItem[] = [
  ...staffItems.filter(item => item.end).map(item => ({ ...item, label: 'Bàn làm việc', group: 'Tổng quan', match: ['/staff/operations'] })),
  { to: '/staff/tasks', label: 'Công việc của tôi', icon: ClipboardList, group: 'Tổng quan' },
  ...section('Đặt kho & bàn giao', { appointments: 'Lịch bàn giao' }),
  ...section('Vận hành kho', { returns: 'Trả kho', transfers: 'Chuyển kho', maintenance: 'Bảo trì' }),
  ...section('Hỗ trợ', { 'support-requests': 'Hỗ trợ khách hàng', 'damage-claims': 'Sự cố tài sản' }),
];

export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={menu} pageNavigation={staffItems} themed /></OperationsWorkspace.Provider>;
}
