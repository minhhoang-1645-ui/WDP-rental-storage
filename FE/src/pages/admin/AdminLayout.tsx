import {
  LayoutDashboard,
  Users,
  History,
  LogIn,
} from "lucide-react";
import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
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
          label: "Quản lý tài khoản",
          icon: Users,
          group: "Quản trị",
        },
        { to: '/admin/login-history', label: 'Lịch sử đăng nhập', icon: LogIn, group: 'Nhật ký' },
        { to: '/admin/activity', label: 'Nhật ký hoạt động', icon: History, group: 'Nhật ký' },
      ]}
    />
  );
}
