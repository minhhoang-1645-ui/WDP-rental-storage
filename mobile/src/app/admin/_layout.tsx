import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';

export default function AdminLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'ADMIN') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
    <Stack.Screen name="index" options={{ title: 'Quản trị hệ thống' }} />
    <Stack.Screen name="users/index" options={{ title: 'Quản lý tài khoản' }} />
    <Stack.Screen name="users/new" options={{ title: 'Tạo tài khoản nội bộ' }} />
    <Stack.Screen name="users/[id]" options={{ title: 'Chi tiết tài khoản' }} />
    <Stack.Screen name="roles" options={{ title: 'Vai trò và quyền' }} />
    <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
  </Stack>;
}
