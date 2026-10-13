import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/use-auth';

export default function IndexScreen() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role === 'CUSTOMER') return <Redirect href="/customer" />;
  if (user.role === 'STAFF') return <Redirect href="/staff" />;
  return <Redirect href="/unsupported" />;
}
