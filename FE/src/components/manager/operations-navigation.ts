import { Boxes, CalendarClock, ChartColumn, ClipboardCheck, ClipboardList, FileText, HardHat, Headphones, Landmark, RefreshCcw, Repeat2, ShieldAlert, ShieldCheck, Tags, Undo2, Users, Warehouse, WalletCards, Receipt, Wallet } from 'lucide-react';
import { isStaffWorkflow } from '../../utils/operation-access';
import { isManagerReviewWorkflow, managerReviewTitle } from '../../utils/manager-review-access';
import type { InternalNavItem } from '../layout/InternalPortalLayout';
import { managerRefundTitle, managerStorageLabels } from '../../utils/manager-sections';

const managerNavigation: InternalNavItem[] = [
  { to: '/manager/damage-claims', label: 'Sự cố hàng hóa cần quyết định', icon: ShieldAlert, group: 'Phê duyệt ngoại lệ' },
  { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Tổng quan' },
  { to: '/manager/operations/support-requests', label: 'Hỗ trợ khách hàng', icon: Headphones, group: 'Tiếp nhận & phân công' },
  { to: '/manager/service-calendar', label: 'Lịch phục vụ', icon: CalendarClock, group: 'Vận hành' },
  { to: '/manager/shifts', label: 'Lịch ca làm', icon: ClipboardCheck, group: 'Nhân sự' },
  { to: '/manager/assignments', label: 'Phân công nhân viên', icon: ClipboardCheck, group: 'Nhân sự' },
  { to: '/manager/operations/appointments', label: 'Lịch bàn giao', icon: CalendarClock, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/renewals', label: 'Gia hạn kho', icon: Undo2, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/transfers', label: 'Chuyển kho', icon: ShieldCheck, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/returns', label: 'Trả kho', icon: RefreshCcw, group: 'Giao nhận & thay đổi' },
  { to: '/manager/operations/deposit-settlements', label: managerRefundTitle, icon: WalletCards, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/early-returns', label: 'Đề nghị trả trước hạn', icon: Undo2, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: WalletCards, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/contracts', label: 'Hợp đồng thuê', icon: FileText, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/payments', label: 'Lịch sử thanh toán', icon: Receipt, group: 'Thanh toán & hợp đồng' },
  { to: '/manager/operations/rentals', label: 'Kho đang thuê', icon: Repeat2, group: 'Kho & khách hàng' },
  { to: '/manager/operations/maintenance', label: 'Bảo trì kho', icon: HardHat, group: 'Kho & khách hàng' },
  { to: '/manager/customers', label: 'Khách hàng', icon: Users, group: 'Kho & khách hàng' },
];
export function operationsNavigation(): InternalNavItem[] {
  return [
    { to: '/manager', label: 'Tổng quan', icon: Landmark, end: true, group: 'Tổng quan' },
    { to: '/manager/reviews', label: 'Việc cần xử lý', icon: ClipboardCheck, group: 'Tổng quan' },
    { to: '/manager/assignments', label: 'Phân công công việc', icon: Users, group: 'Vận hành' },
    { to: '/manager/reservations', label: 'Đặt kho', icon: ClipboardList, group: 'Vận hành', match: ['/manager/operations/reservations'] },
    { to: '/manager/operations/contracts', label: 'Hợp đồng', icon: FileText, group: 'Vận hành' },
    { to: '/manager/operations/appointments', label: 'Bàn giao kho', icon: CalendarClock, group: 'Vận hành' },
    { to: '/manager/operations/renewals', label: 'Gia hạn', icon: Undo2, group: 'Vận hành' },
    { to: '/manager/operations/transfers', label: 'Chuyển kho', icon: ShieldCheck, group: 'Vận hành' },
    { to: '/manager/operations/returns', label: 'Trả kho', icon: RefreshCcw, group: 'Vận hành', match: ['/manager/early-returns'] },
    { to: '/manager/operations/maintenance', label: 'Bảo trì', icon: HardHat, group: 'Vận hành' },
    { to: '/manager/damage-claims', label: 'Sự cố', icon: ShieldAlert, group: 'Vận hành' },
    { to: '/manager/operations/support-requests', label: 'Hỗ trợ khách hàng', icon: Headphones, group: 'Vận hành' },
    { to: '/manager/catalog', label: managerStorageLabels.catalog.title, icon: Tags, end: true, group: 'Quản lý cơ sở' },
    { to: '/manager/units', label: managerStorageLabels.units.title, icon: Warehouse, group: 'Quản lý cơ sở', match: ['/manager/facility', '/manager/overstays'] },
    { to: '/manager/catalog/additional-services', label: 'Dịch vụ tại cơ sở', icon: Boxes, group: 'Quản lý cơ sở' },
    { to: '/manager/staff', label: 'Nhân viên', icon: Users, group: 'Quản lý cơ sở' },
    { to: '/manager/customers', label: 'Khách hàng', icon: Users, group: 'Quản lý cơ sở' },
    { to: '/manager/operations/invoices', label: 'Hóa đơn', icon: Receipt, group: 'Tài chính', match: ['/manager/finance'] },
    { to: '/manager/operations/payments', label: 'Khoản thu', icon: Wallet, group: 'Tài chính' },
    { to: '/manager/operations/deposit-settlements', label: managerRefundTitle, icon: WalletCards, group: 'Tài chính' },
    { to: '/manager/reports', label: 'Báo cáo hoạt động cơ sở', icon: ChartColumn, group: 'Báo cáo' },
  ];
}
export const managerPageNavigation = () => managerNavigation.filter(item => !isStaffWorkflow(item.to.split('/').at(-1) ?? '') || isManagerReviewWorkflow(item.to.split('/').at(-1) ?? '')).map(item => ({...item, label:isManagerReviewWorkflow(item.to.split('/').at(-1) ?? '') ? managerReviewTitle(item.to.split('/').at(-1)!) : item.label }));

export function staffNavigation(): InternalNavItem[] {
  return managerNavigation.filter(item => item.end || isStaffWorkflow(item.to.split('/').at(-1) ?? '') || item.to.endsWith('/rentals') || item.to.endsWith('/damage-claims')).map(item => ({ ...item, to: item.to.replace('/manager', '/staff').replace('/staff/operations/', '/staff/'), label: item.end ? 'Bàn làm việc' : item.label, group: item.group === 'Tiếp nhận & phân công' ? 'Tiếp nhận yêu cầu' : item.group === 'Kho & khách hàng' ? 'Tra cứu & bảo trì' : item.group }));
}
