import { roleNamespace } from '../role-names';
import { canAccessManagerReview } from '@/utils/manager-review-access';
import { isStaffWorkflow } from '@/utils/operation-access';
import { resources, type ResourceDefinition } from '@/operations/model';
import { shortLabel } from '@/utils/ui-labels';

export type PortalRole = 'STORAGE_CUSTOMER' | 'FACILITY_STAFF';
const customerKeys = ['contracts', 'rentals', 'invoices', 'payments', 'payment-submissions', 'appointments', 'renewals', 'returns', 'deposit-settlements', 'support-requests'];
const staffKeys = ['appointments', 'rentals', 'returns', 'maintenance', 'support-requests', 'transfers'];
export function portalResource(role: PortalRole, key: string): ResourceDefinition | undefined {
  if (role === 'STORAGE_CUSTOMER' && key === 'reservations') return { title: 'Đơn đặt kho', path: '/reservations', shape: 'array', statuses: resources.reservations.statuses };
  if (role === 'STORAGE_CUSTOMER' && key === 'payment-history') return { title: 'Lịch sử thanh toán', path: '/customer/payments' };
  if (role === 'STORAGE_CUSTOMER' && key === 'transfers') return { title: 'Chuyển kho', path: '/customer/support-requests' };
  if (!(role === 'STORAGE_CUSTOMER' ? customerKeys : staffKeys).includes(key)) return;
  const config = resources[key];
  const titles: Record<string, string> = {
    'support-requests': 'Hỗ trợ',
    'payment-submissions': 'Thông báo chuyển khoản',
    rentals: 'Kho đang thuê',
    invoices: 'Hóa đơn',
    contracts: 'Hợp đồng',
    appointments: 'Lịch nhận kho',
    renewals: 'Gia hạn',
    returns: 'Trả kho',
  };
  return config ? { ...config, ...(role === 'STORAGE_CUSTOMER' ? {title: titles[key] ?? config.title} : {}), path: `/${roleNamespace(role)}/${key}`, shape: undefined } : undefined;
}

export function portalScreenOptions(role: PortalRole) {
  return ({ route }: { route: { params?: object } }) => {
    const params = route.params;
    const resource = params && 'resource' in params && typeof params.resource === 'string' ? params.resource : '';
    const config = role === 'STORAGE_CUSTOMER'
      ? portalResource(role, resource)
      : Object.hasOwn(resources, resource) ? resources[resource] : undefined;
    return { title: config ? shortLabel(config.title) : 'Không tìm thấy trang' };
  };
}

export function relatedResource(root: string, key: string): string | undefined {
  if (root === '/manager') return Object.hasOwn(resources, key) && canAccessManagerReview('FACILITY_MANAGER', key) ? key : undefined;
  if (root === '/staff') return isStaffWorkflow(key) || key === 'rentals' ? key : undefined;
  if (root === '/admin') return key === 'users' ? key : undefined;
  if (root === '/customer' && key === 'payments') return 'payment-history';
  if (root === '/customer') return portalResource('STORAGE_CUSTOMER', key) ? key : undefined;
}
