import {
  LayoutDashboard,
  Users,
  History,
  LogIn,
  Settings,
} from "lucide-react";
import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import type { WorkspaceSection } from "../../components/workspace/WorkspaceSectionPage";

const auditItems = [
  { to: '/admin/login-history', label: 'Lịch sử đăng nhập', icon: LogIn },
  { to: '/admin/activity', label: 'Nhật ký hoạt động', icon: History },
];
export const adminSections: WorkspaceSection[] = [{ key: 'audit', title: 'Nhật ký', items: auditItems }];

export function AdminLayout() {
  return (
    <InternalPortalLayout
      label="Quản trị hệ thống"
      navigation={[
        {
          to: "/admin",
          label: "Tổng quan",
          icon: LayoutDashboard,
          end: true,
          group: "Quản trị",
        },
        {
          to: "/admin/users",
          label: "Tài khoản",
          icon: Users,
          group: "Quản trị",
        },
        { to: '/admin/sections/audit', label: 'Lịch sử hoạt động', icon: History, group: 'Quản trị', match: auditItems.map(item => item.to) },
        { to: '/admin/settings', label: 'Chính sách hệ thống', icon: Settings, group: 'Quản trị' },
      ]}
      pageNavigation={auditItems}
    />
  );
}
