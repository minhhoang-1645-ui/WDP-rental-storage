import {
  CalendarClock,
  ClipboardCheck,
  HardHat,
  Headphones,
  Repeat2,
  RotateCcw,
  Warehouse,
} from "lucide-react";
import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";

export function StaffLayout() {
  return (
    <InternalPortalLayout
      label="Khu vực nhân viên"
      navigation={[
        { to: "/staff", label: "Tác nghiệp", icon: ClipboardCheck, end: true },
        { to: "/staff/appointments", label: "Bàn giao", icon: CalendarClock },
        { to: "/staff/rentals", label: "Kho đang thuê", icon: Warehouse },
        { to: "/staff/returns", label: "Trả kho", icon: RotateCcw },
        { to: "/staff/maintenance", label: "Bảo trì", icon: HardHat },
        {
          to: "/staff/support-requests",
          label: "Hỗ trợ khách hàng",
          icon: Headphones,
        },
        { to: "/staff/transfers", label: "Chuyển kho", icon: Repeat2 },
      ]}
    />
  );
}
