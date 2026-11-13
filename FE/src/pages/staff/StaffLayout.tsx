import { Bell, Boxes, ClipboardList, Warehouse } from 'lucide-react';
import { InternalPortalLayout, type InternalNavItem } from '../../components/layout/InternalPortalLayout';
import { staffNavigation } from '../../components/manager/operations-navigation';
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import type { WorkspaceSection } from '../../components/workspace/WorkspaceSectionPage';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';

const staffItems = staffNavigation();
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
    return [{ ...item, label, group, match: [`/staff/operations/${resource}`, ...(resource === 'rentals' ? ['/staff/overstays'] : [])] }];
  });
}

const menu: InternalNavItem[] = [
  ...staffItems.filter(item => item.end).map(item => ({ ...item, label: 'Bàn làm việc', group: 'Tổng quan' })),
  { to: '/staff/tasks', label: 'Công việc của tôi', icon: ClipboardList, group: 'Tổng quan' },
  ...section('Đặt kho & bàn giao', { reservations: 'Yêu cầu đặt kho', inquiries: 'Tư vấn khách hàng', appointments: 'Lịch bàn giao' }),
  ...section('Hàng hóa', { 'stock-movements': 'Phiếu nhập – xuất' }),
  { to: '/staff/stored-items', label: 'Hàng đang lưu', icon: Boxes, group: 'Hàng hóa' },
  { to: '/staff/assigned-units', label: 'Kho tôi phụ trách', icon: Warehouse, group: 'Hàng hóa' },
  ...section('Vận hành kho', { rentals: 'Kho đang thuê', renewals: 'Gia hạn', transfers: 'Chuyển kho', returns: 'Trả kho', 'support-requests': 'Hỗ trợ khách hàng', maintenance: 'Bảo trì', 'damage-claims': 'Sự cố hàng hóa' }),
  { to: '/staff/notifications', label: 'Thông báo', icon: Bell, group: 'Tài khoản' },
];

export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={menu} pageNavigation={staffItems} themed /></OperationsWorkspace.Provider>;
}
