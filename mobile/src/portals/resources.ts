import { canAccessManagerReview } from '@/utils/manager-review-access';
import { isStaffWorkflow } from '@/utils/operation-access';
import { resources, type ResourceDefinition } from '@/operations/model';
import { shortLabel } from '@/utils/ui-labels';

export type PortalRole = 'CUSTOMER' | 'STAFF';
const customerKeys = ['contracts', 'rentals', 'invoices', 'payments', 'payment-submissions', 'appointments', 'renewals', 'returns', 'deposit-settlements', 'support-requests'];
const staffKeys = ['appointments', 'rentals', 'returns', 'maintenance', 'support-requests', 'transfers'];
export function portalResource(role: PortalRole, key: string): ResourceDefinition | undefined {
  if (role === 'CUSTOMER' && key === 'reservations') return { title: 'Đơn đặt kho', path: '/reservations', shape: 'array', statuses: resources.reservations.statuses };
  if (role === 'CUSTOMER' && key === 'payment-history') return { title: 'Lịch sử thanh toán', path: '/customer/payments' };
  if (role === 'CUSTOMER' && key === 'transfers') return { title: 'Yêu cầu chuyển kho', path: '/customer/support-requests' };
  if (!(role === 'CUSTOMER' ? customerKeys : staffKeys).includes(key)) return;
  const config = resources[key];
  const titles: Record<string, string> = {'support-requests': 'Hỗ trợ', rentals: 'Kho của tôi', invoices: 'Hóa đơn', contracts: 'Hợp đồng của tôi', appointments: 'Lịch nhận kho', renewals: 'Gia hạn kho', returns: 'Trả kho'};
  return config ? { ...config, ...(role === 'CUSTOMER' ? {title: titles[key] ?? config.title} : {}), path: `/${role.toLowerCase()}/${key}`, shape: undefined } : undefined;
}

export function portalScreenOptions(role: PortalRole) {
  return ({ route }: { route: { params?: object } }) => {
    const params = route.params;
    const resource = params && 'resource' in params && typeof params.resource === 'string' ? params.resource : '';
    const config = role === 'CUSTOMER'
      ? portalResource(role, resource)
      : Object.hasOwn(resources, resource) ? resources[resource] : undefined;
    return { title: config ? shortLabel(config.title) : 'Không tìm thấy trang' };
  };
}

export function relatedResource(root: string, key: string): string | undefined {
  if (root === '/manager') return Object.hasOwn(resources, key) && canAccessManagerReview('MANAGER', key) ? key : undefined;
  if (root === '/staff') return isStaffWorkflow(key) || key === 'rentals' ? key : undefined;
  if (root === '/admin') return key === 'users' ? key : undefined;
  if (root === '/customer' && key === 'payments') return 'payment-history';
  if (root === '/customer') return portalResource('CUSTOMER', key) ? key : undefined;
}
