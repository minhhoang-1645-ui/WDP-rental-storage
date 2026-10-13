import { use } from 'react';

import { AuthContext } from '@/auth/auth-context';

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth phải được dùng bên trong AuthProvider.');
  return value;
}
