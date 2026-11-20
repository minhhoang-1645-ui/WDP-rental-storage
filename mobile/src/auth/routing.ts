import type { PublicUser } from '@/types/api';

export function destination(role: PublicUser['role']) {
  return role === 'ADMIN' ? '/admin' as const : role === 'MANAGER' ? '/manager' as const : role === 'STAFF' ? '/staff' as const : '/customer' as const;
}
