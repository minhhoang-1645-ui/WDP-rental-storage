import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';

export default function ManagerLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'MANAGER' && user.role !== 'ADMIN') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
    <Stack.Screen name="index" options={{ title: 'Quản lý cơ sở' }} />
    <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
    <Stack.Screen name="[resource]/index" options={{ title: 'Danh sách' }} />
    <Stack.Screen name="[resource]/[id]" options={{ title: 'Chi tiết' }} />
  </Stack>;
}
