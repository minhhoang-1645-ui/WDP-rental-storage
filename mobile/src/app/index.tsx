import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/use-auth';
import { destination } from '@/auth/routing';

export default function IndexScreen() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={destination(user.role)} />;
}
