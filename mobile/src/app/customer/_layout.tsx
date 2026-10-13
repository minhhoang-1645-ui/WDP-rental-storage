import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';

export default function CustomerLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'CUSTOMER') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
    <Stack.Screen name="index" options={{ title: 'WDP Customer' }} />
    <Stack.Screen name="rentals" options={{ title: 'Kho đang thuê' }} />
    <Stack.Screen name="payments" options={{ title: 'Thanh toán' }} />
    <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
  </Stack>;
}
