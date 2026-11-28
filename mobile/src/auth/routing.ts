import type { PublicUser } from '@/types/api';
export function destination(role:PublicUser['role']) {
 return role==='STORAGE_CUSTOMER'?'/customer' as const:'/unsupported' as const;
}
