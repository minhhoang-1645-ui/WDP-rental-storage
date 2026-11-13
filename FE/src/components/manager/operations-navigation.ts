import { BarChart3, Bell, Boxes, CalendarClock, ClipboardCheck, ClipboardList, FileText, HardHat, Headphones, Landmark, RefreshCcw, Repeat2, ShieldAlert, ShieldCheck, Undo2, Users, Warehouse, WalletCards, Receipt, Wallet } from 'lucide-react';
import { isStaffWorkflow } from '../../utils/operation-access';
import { isManagerReviewWorkflow, managerReviewTitle } from '../../utils/manager-review-access';
import type { InternalNavItem } from '../layout/InternalPortalLayout';
import { managerSections } from '../../utils/manager-sections';

const managerNavigation: InternalNavItem[] = [
  { to: '/manager/damage-claims', label: 'Sự cố hàng hóa cần quyết định', icon: ShieldAlert, group: 'Phê duyệt ngoại lệ' },
  { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Tổng quan' },
  { to: '/manager/reports', label: 'Báo cáo & Thống kê', icon: BarChart3, group: 'Tổng quan' },
  { to: '/manager/reservations', label: 'Yêu cầu đặt kho', icon: ClipboardCheck, group: 'Tiếp nhận & phân công' },
  { to: '/manager/inquiries', label: 'Yêu cầu tư vấn', icon: ClipboardList, group: 'Tiếp nhận & phân công' },
  { to: '/manager/operations/support-requests', label: 'Hỗ trợ khách hàng', icon: Headphones, group: 'Tiếp nhận & phân công' },
  { to: '/manager/assignments', label: 'Phân công nhân viên', icon: ClipboardCheck, group: 'Nhân sự' },
  { to: '/manager/operations/appointments', label: 'Lịch bàn giao', icon: CalendarClock, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/stock-movements', label: 'Nhập – xuất hàng', icon: ClipboardList, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/renewals', label: 'Gia hạn kho', icon: Undo2, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/transfers', label: 'Chuyển kho', icon: ShieldCheck, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/returns', label: 'Trả kho', icon: RefreshCcw, group: 'Giao nhận & thay đổi' },
  { to: '/manager/payment-submissions', label: 'Chờ xác nhận thanh toán', icon: Wallet, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/deposit-settlements', label: 'Quyết toán cọc', icon: WalletCards, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/early-returns', label: 'Đề nghị trả trước hạn', icon: Undo2, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/online-payment-reconciliations', label: 'Đối soát VNPay', icon: ShieldAlert, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: WalletCards, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/contracts', label: 'Hợp đồng thuê', icon: FileText, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/payments', label: 'Lịch sử thanh toán', icon: Receipt, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/rentals', label: 'Kho đang thuê', icon: Repeat2, group: 'Kho & khách hàng' },
  { to: '/manager/units', label: 'Danh sách kho', icon: Warehouse, group: 'Kho & khách hàng' },
  { to: '/manager/stored-items', label: 'Hàng đang lưu theo kho', icon: ClipboardList, group: 'Kho & khách hàng' },
  { to: '/manager/catalog', label: 'Loại kho & bảng giá', icon: ClipboardList, group: 'Kho & khách hàng' },
  { to: '/manager/operations/maintenance', label: 'Bảo trì kho', icon: HardHat, group: 'Kho & khách hàng' },
  { to: '/manager/customers', label: 'Khách hàng', icon: Users, group: 'Kho & khách hàng' },
];
export function operationsNavigation(): InternalNavItem[] {
  return [
    { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Quản lý' },
    { to: '/manager/reviews', label: 'Việc cần duyệt', icon: ClipboardCheck, group: 'Quản lý', match: managerSections.reviews.items.map(item => item.web.split('?')[0]) },
    { to: '/manager/assignments', label: 'Phân công', icon: Users, group: 'Quản lý', match: ['/manager/operations/stock-movements'] },
    { to: '/manager/units', label: 'Danh sách kho', icon: Warehouse, group: 'Kho & khách hàng', match: ['/manager/facility', '/manager/overstays'] },
    { to: '/manager/stored-items', label: 'Hàng đang lưu', icon: Boxes, group: 'Kho & khách hàng' },
    { to: '/manager/customers', label: 'Khách hàng', icon: Users, group: 'Kho & khách hàng' },
    { to: '/manager/operations/contracts', label: 'Hợp đồng', icon: FileText, group: 'Kho & khách hàng', match: ['/manager/rental-records'] },
    { to: '/manager/operations/rentals', label: 'Kho đang thuê', icon: Repeat2, group: 'Kho & khách hàng' },
    { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: Receipt, group: 'Tài chính', match: ['/manager/finance'] },
    { to: '/manager/operations/payments', label: 'Khoản thu', icon: Wallet, group: 'Tài chính' },
    { to: '/manager/payment-submissions', label: 'Duyệt chuyển khoản', icon: ClipboardCheck, group: 'Tài chính' },
    { to: '/manager/online-payment-reconciliations', label: 'Đối soát VNPay', icon: ShieldAlert, group: 'Tài chính' },
    { to: '/manager/operations/deposit-settlements', label: 'Tiền cọc', icon: WalletCards, group: 'Tài chính' },
    { to: '/manager/catalog', label: 'Loại kho & giá', icon: ClipboardList, end: true, group: 'Danh mục & báo cáo' },
    { to: '/manager/catalog/additional-services', label: 'Dịch vụ bổ sung', icon: Boxes, group: 'Danh mục & báo cáo' },
    { to: '/manager/reports', label: 'Báo cáo', icon: BarChart3, group: 'Danh mục & báo cáo' },
    { to: '/manager/notifications', label: 'Thông báo', icon: Bell, group: 'Tài khoản' },
  ];
}
export const managerPageNavigation = () => managerNavigation.filter(item => !isStaffWorkflow(item.to.split('/').at(-1) ?? '') || isManagerReviewWorkflow(item.to.split('/').at(-1) ?? '')).map(item => ({...item, label:isManagerReviewWorkflow(item.to.split('/').at(-1) ?? '') ? managerReviewTitle(item.to.split('/').at(-1)!) : item.label }));

export function staffNavigation(): InternalNavItem[] {
  return managerNavigation.filter(item => item.end || isStaffWorkflow(item.to.split('/').at(-1) ?? '') || item.to.endsWith('/rentals') || item.to.endsWith('/damage-claims')).map(item => ({ ...item, to: item.to.replace('/manager', '/staff').replace('/staff/operations/', '/staff/'), label: item.end ? 'Bàn làm việc' : item.label, group: item.group === 'Tiếp nhận & phân công' ? 'Tiếp nhận yêu cầu' : item.group === 'Kho & khách hàng' ? 'Tra cứu & bảo trì' : item.group }));
}
