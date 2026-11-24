import { History, LayoutDashboard, LogIn, Shield, Users } from 'lucide-react';
import { InternalPortalLayout, type InternalNavItem } from '../../components/layout/InternalPortalLayout';
import type { WorkspaceSection } from '../../components/workspace/WorkspaceSectionPage';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';
import '../../styles/admin-workspace.css';

const auditItems = [
  { to: '/admin/login-history', label: 'Lịch sử đăng nhập', icon: LogIn },
  { to: '/admin/activity', label: 'Nhật ký hoạt động', icon: History },
  { to: '/admin/permission-history', label: 'Lịch sử thay đổi quyền', icon: Shield },
];
export const adminSections: WorkspaceSection[] = [{ key: 'audit', title: 'Nhật ký', items: auditItems }];

const navigation: InternalNavItem[] = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true, group: 'Quản trị' },
  { to: '/admin/users', label: 'Quản lý tài khoản', icon: Users, group: 'Quản trị' },
  { to: '/admin/roles', label: 'Vai trò và phân quyền', icon: Shield, group: 'Quản trị' },
  { to: '/admin/facility-access', label: 'Quyền cơ sở', icon: Users, group: 'Quản trị' },
  ...auditItems.map(item => ({ ...item, group: 'Nhật ký' })),
];

export function AdminLayout() {
  return <InternalPortalLayout label="Quản trị hệ thống" navigation={navigation} themed />;
}
