import {
  ClipboardList,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import { operationsNavigation } from "../../components/manager/operations-navigation";
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
export function AdminLayout() {
  return (
    <OperationsWorkspace.Provider value="/admin/facility"><InternalPortalLayout
      label="Quản trị hệ thống"
      pageNavigation={operationsNavigation("/admin/facility")}
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
        {
          to: "/admin/roles",
          label: "Vai trò và quyền",
          icon: ShieldCheck,
          group: "Quản trị",
        },
        {
          to: "/admin/assignments",
          label: "Phân công nhân viên",
          icon: ClipboardList,
          group: "Quản trị",
        },
        {
          to: "/admin/settings",
          label: "Cấu hình cơ sở",
          icon: Settings,
          group: "Quản trị",
        },
        {
          to: "/admin/activity",
          label: "Nhật ký hoạt động",
          icon: History,
          group: "Quản trị",
        },
        {
          to: "/admin/account-status",
          label: "Trạng thái tài khoản",
          icon: UserCheck,
          group: "Quản trị",
        },
      ]}
    /></OperationsWorkspace.Provider>
  );
}
