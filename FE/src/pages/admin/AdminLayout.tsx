import { Home, Layers3, LogIn, Shield, Users, Warehouse } from 'lucide-react';
import { InternalPortalLayout, type InternalNavItem } from '../../components/layout/InternalPortalLayout';
import type { WorkspaceSection } from '../../components/workspace/WorkspaceSectionPage';
import { AdminSearch } from './AdminSearch';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';
import '../../styles/admin-workspace.css';

const auditItems = [
  { to: '/admin/login-history', label: 'Lịch sử đăng nhập', icon: LogIn },
  { to: '/admin/activity', label: 'Nhật ký hoạt động', icon: Layers3 },
  { to: '/admin/permission-history', label: 'Lịch sử thay đổi quyền', icon: Shield },
];
export const adminSections: WorkspaceSection[] = [{ key: 'audit', title: 'Nhật ký', items: auditItems }];

const navigation: InternalNavItem[] = [
  { to: '/admin', label: 'Tổng quan', icon: Home, end: true, group: 'Tổng quan' },
  { to: '/admin/users', label: 'Quản lý tài khoản', icon: Users, group: 'Quản lý truy cập' },
  { to: '/admin/roles', label: 'Vai trò & phân quyền', icon: Shield, group: 'Quản lý truy cập' },
  { to: '/admin/facility-access', label: 'Quyền truy cập cơ sở', icon: Warehouse, group: 'Quản lý truy cập' },
  ...auditItems.map(item => ({ ...item, group: 'Bảo mật' })),
];

export function AdminLayout() {
  return <InternalPortalLayout label="Quản trị hệ thống" navigation={navigation} pageNavigation={[{ to: '/admin/settings', label: 'Cài đặt' }]} topbarControl={<AdminSearch />} themed />;
}
