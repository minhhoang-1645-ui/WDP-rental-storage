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
const menu = [
  ...staffItems.filter(item => !groups.some(group => group.title === item.group)),
  ...staffSections.flatMap(section => section.items.length ? [{
    to: `/staff/sections/${section.key}`, label: section.title,
    icon: section.items[0].icon, match: section.items.map(item => item.to),
  }] : []),
].map(item => ({ ...item, group: 'Nhân viên vận hành' }));

export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={menu} pageNavigation={staffItems} /></OperationsWorkspace.Provider>;
}
