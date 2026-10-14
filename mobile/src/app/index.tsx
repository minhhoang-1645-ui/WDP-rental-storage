import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/use-auth';
import { roleHome } from '@/utils/role-home';

export default function IndexScreen() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={roleHome(user.role)} />;
}
