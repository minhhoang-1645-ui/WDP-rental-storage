import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { destination } from '@/auth/routing';

export default function UnsupportedRoleScreen() {
  const { user } = useAuth();
  return <Redirect href={user ? destination(user.role) : '/login'} />;
}
