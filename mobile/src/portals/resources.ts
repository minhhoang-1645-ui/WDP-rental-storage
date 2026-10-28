import { isStaffWorkflow, isManagerResource } from '@/utils/operation-access';
import { resources, type ResourceDefinition } from '@/operations/model';

export type PortalRole = 'CUSTOMER' | 'STAFF';
const customerKeys = ['contracts', 'rentals', 'invoices', 'payments', 'payment-submissions', 'appointments', 'renewals', 'returns', 'deposit-settlements', 'support-requests'];
const staffKeys = ['appointments', 'rentals', 'returns', 'maintenance', 'support-requests', 'transfers'];
export function portalResource(role: PortalRole, key: string): ResourceDefinition | undefined {
  if (role === 'CUSTOMER' && key === 'reservations') return { title: 'Yêu cầu đặt kho', path: '/reservations', shape: 'array' };
  if (role === 'CUSTOMER' && key === 'payment-history') return { title: 'Lịch sử thanh toán', path: '/customer/payments' };
  if (role === 'CUSTOMER' && key === 'transfers') return { title: 'Yêu cầu chuyển kho', path: '/customer/support-requests' };
  if (!(role === 'CUSTOMER' ? customerKeys : staffKeys).includes(key)) return;
  const config = resources[key];
  return config ? { ...config, path: `/${role.toLowerCase()}/${key}`, shape: undefined } : undefined;
}
export function relatedResource(root: string, key: string): string | undefined {
  if (root === '/manager') return Object.hasOwn(resources, key) && isManagerResource(key) ? key : undefined;
  if (root === '/staff') return isStaffWorkflow(key) || key === 'rentals' ? key : undefined;
  if (root === '/admin') return key === 'users' ? key : undefined;
  if (root === '/customer' && key === 'payments') return 'payment-history';
  if (root === '/customer') return portalResource('CUSTOMER', key) ? key : undefined;
}
