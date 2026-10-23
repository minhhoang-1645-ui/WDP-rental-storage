import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';

export default function StaffLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'STAFF') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
    <Stack.Screen name="index" options={{ title: 'Công việc của tôi' }} />
    <Stack.Screen name="appointments" options={{ title: 'Lịch bàn giao' }} />
    <Stack.Screen name="tasks" options={{ title: 'Công việc vận hành' }} />
    <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
  </Stack>;
}
