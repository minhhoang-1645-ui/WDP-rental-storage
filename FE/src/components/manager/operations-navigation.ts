import { BarChart3, CalendarClock, ClipboardCheck, ClipboardList, FileText, HardHat, Headphones, Landmark, RefreshCcw, Repeat2, ShieldCheck, Undo2, Users, Warehouse, WalletCards, Receipt, CircleDollarSign, Wallet } from 'lucide-react';
import { isStaffWorkflow } from '../../utils/operation-access';
import type { InternalNavItem } from '../layout/InternalPortalLayout';

const managerNavigation: InternalNavItem[] = [
  { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Tổng quan' },
  { to: '/manager/reports', label: 'Báo cáo & Thống kê', icon: BarChart3, group: 'Tổng quan' },
  { to: '/manager/reservations', label: 'Yêu cầu đặt kho', icon: ClipboardCheck, group: 'Tiếp nhận & phân công' },
  { to: '/manager/inquiries', label: 'Yêu cầu tư vấn', icon: ClipboardList, group: 'Tiếp nhận & phân công' },
  { to: '/manager/operations/support-requests', label: 'Hỗ trợ khách hàng', icon: Headphones, group: 'Tiếp nhận & phân công' },
  { to: '/manager/assignments', label: 'Phân công nhân viên', icon: ClipboardCheck, group: 'Tiếp nhận & phân công' },
  { to: '/manager/operations/appointments', label: 'Lịch bàn giao', icon: CalendarClock, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/stock-movements', label: 'Nhập – xuất hàng', icon: ClipboardList, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/renewals', label: 'Gia hạn kho', icon: Undo2, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/transfers', label: 'Chuyển kho', icon: ShieldCheck, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/returns', label: 'Trả kho', icon: RefreshCcw, group: 'Giao nhận & thay đổi' },
  { to: '/manager/payment-submissions', label: 'Chờ xác nhận thanh toán', icon: Wallet, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: WalletCards, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/contracts', label: 'Hợp đồng thuê', icon: FileText, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/payments', label: 'Lịch sử thanh toán', icon: Receipt, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/deposit-settlements', label: 'Quyết toán cọc', icon: CircleDollarSign, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/rentals', label: 'Kho đang thuê', icon: Repeat2, group: 'Kho & khách hàng' },
  { to: '/manager/units', label: 'Kho vật lý', icon: Warehouse, group: 'Kho & khách hàng' },
  { to: '/manager/catalog', label: 'Loại kho & bảng giá', icon: ClipboardList, group: 'Kho & khách hàng' },
  { to: '/manager/operations/maintenance', label: 'Bảo trì kho', icon: HardHat, group: 'Kho & khách hàng' },
  { to: '/manager/customers', label: 'Danh bạ khách hàng', icon: Users, group: 'Kho & khách hàng' },
];
export function operationsNavigation(base = '/manager'): InternalNavItem[] {
  return managerNavigation.filter(item => !isStaffWorkflow(item.to.split('/').at(-1) ?? '')).map(item => ({ ...item, to: base + item.to.slice('/manager'.length), label: item.end && base !== '/manager' ? 'Tổng quan vận hành' : item.label }));
}

export function staffNavigation(): InternalNavItem[] {
  return managerNavigation.filter(item => item.end || isStaffWorkflow(item.to.split('/').at(-1) ?? '') || item.to.endsWith('/rentals')).map(item => ({ ...item, to: item.to.replace('/manager', '/staff').replace('/staff/operations/', '/staff/'), label: item.end ? 'Bàn làm việc' : item.label }));
}
