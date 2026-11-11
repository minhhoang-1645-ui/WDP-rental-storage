import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout';
import { staffNavigation } from '../../components/manager/operations-navigation';
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import type { WorkspaceSection } from '../../components/workspace/WorkspaceSectionPage';

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
// Direct destinations keep the old section routes available without forcing an extra step.
const menu = [
  ...staffItems.filter(item => item.end).map(item => ({ ...item, group: 'Tổng quan' })),
  ...staffItems.filter(item => ['reservations', 'inquiries'].includes(item.to.split('/').at(-1) ?? '')).map(item => ({ ...item, group: 'Đặt kho & tư vấn' })),
  ...staffItems.filter(item => item.to.endsWith('/appointments')).map(item => ({ ...item, group: 'Bàn giao kho' })),
  ...staffItems.filter(item => item.to.endsWith('/stock-movements')).map(item => ({ ...item, group: 'Hàng hóa' })),
  { to: '/staff/stored-items', label: 'Hàng đang lưu', icon: staffItems[0].icon, group: 'Hàng hóa' },
  ...staffItems.filter(item => ['renewals', 'transfers', 'returns'].includes(item.to.split('/').at(-1) ?? '')).map(item => ({ ...item, group: 'Thay đổi kỳ thuê' })),
  ...staffItems.filter(item => ['support-requests', 'maintenance', 'damage-claims'].includes(item.to.split('/').at(-1) ?? '')).map(item => ({ ...item, label: item.to.endsWith('/damage-claims') ? 'Sự cố hàng hóa' : item.label, group: 'Hỗ trợ & bảo trì' })),
  ...staffItems.filter(item => !item.end && !['reservations','inquiries','appointments','stock-movements','renewals','transfers','returns','support-requests','maintenance','damage-claims','stored-items'].includes(item.to.split('/').at(-1) ?? '')).map(item => ({ ...item, group: 'Tra cứu' })),
];

export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={menu} pageNavigation={staffItems} /></OperationsWorkspace.Provider>;
}
