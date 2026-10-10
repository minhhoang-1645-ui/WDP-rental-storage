import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HardHat,
  Headphones,
  Landmark,
  RefreshCcw,
  Repeat2,
  ShieldCheck,
  Undo2,
  Users,
  Warehouse,
  WalletCards,
  Receipt,
  CircleDollarSign,
} from 'lucide-react'
import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout'

export function ManagerLayout() {
  return (
    <InternalPortalLayout
      label="Manager Portal"
      navigation={[
        // Nhóm: Tổng quan & Báo cáo
        { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Tổng quan' },
        { to: '/manager/reports', label: 'Báo cáo & Thống kê', icon: BarChart3, group: 'Tổng quan' },

        // Nhóm: Đặt kho & Khách hàng
        { to: '/manager/reservations', label: 'Yêu cầu đặt kho', icon: ClipboardCheck, group: 'Tiếp nhận yêu cầu' },
        { to: '/manager/inquiries', label: 'Yêu cầu tư vấn', icon: ClipboardList, group: 'Tiếp nhận yêu cầu' },

        // Nhóm: Vận hành thuê kho
        { to: '/manager/operations/appointments', label: 'Lịch bàn giao', icon: CalendarClock, group: 'Vận hành thuê kho' },
        { to: '/manager/operations/rentals', label: 'Kho đang thuê', icon: Repeat2, group: 'Vận hành thuê kho' },
        { to: '/manager/operations/renewals', label: 'Gia hạn kho', icon: Undo2, group: 'Vận hành thuê kho' },
        { to: '/manager/operations/transfers', label: 'Chuyển kho', icon: ShieldCheck, group: 'Vận hành thuê kho' },
        { to: '/manager/operations/returns', label: 'Trả kho', icon: RefreshCcw, group: 'Vận hành thuê kho' },

        // Nhóm: Kho & Cơ sở
        { to: '/manager/units', label: 'Kho vật lý', icon: Warehouse, group: 'Kho & Cơ sở' },
        { to: '/manager/operations/maintenance', label: 'Bảo trì kho', icon: HardHat, group: 'Kho & Cơ sở' },
        { to: '/manager/operations/support-requests', label: 'Hỗ trợ khách hàng', icon: Headphones, group: 'Kho & Cơ sở' },

        // Nhóm: Tài chính & Hợp đồng
        { to: '/manager/operations/contracts', label: 'Hợp đồng thuê', icon: FileText, group: 'Tài chính & Pháp lý' },
        { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: WalletCards, group: 'Tài chính & Pháp lý' },
        { to: '/manager/operations/payments', label: 'Lịch sử thanh toán', icon: Receipt, group: 'Tài chính & Pháp lý' },
        { to: '/manager/operations/deposit-settlements', label: 'Quyết toán cọc', icon: CircleDollarSign, group: 'Tài chính & Pháp lý' },

        // Nhóm: Khách hàng
        { to: '/manager/customers', label: 'Danh bạ khách hàng', icon: Users, group: 'Khách hàng' },
      ]}
    />
  )
}
