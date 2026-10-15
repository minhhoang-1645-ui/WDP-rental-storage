import type { UserRole } from '@/types/api';

export function roleHome(role: UserRole) {
  const homes = { CUSTOMER: '/customer', STAFF: '/staff', MANAGER: '/manager', ADMIN: '/admin' } as const;
  return homes[role];
}

