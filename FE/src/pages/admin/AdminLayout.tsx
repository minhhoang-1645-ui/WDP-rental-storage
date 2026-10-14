import {
  LayoutDashboard,
  Users,
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
      ]}
    />
  );
}
