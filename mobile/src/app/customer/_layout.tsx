import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';
import { ActivityBell } from '@/activity/ActivityCenter';
import { BottomNav } from '@/components/bottom-nav';

export default function CustomerLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'CUSTOMER') return <Redirect href="/" />;
  return <View style={layout.root}>
    <Stack screenOptions={{ headerRight: () => <ActivityBell />, headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
      <Stack.Screen name="index" options={{ title: 'Tài khoản của tôi' }} />
      <Stack.Screen name="discover" options={{ title: 'Tìm kho' }} />
      <Stack.Screen name="booking" options={{ title: 'Đặt kho' }} />
      <Stack.Screen name="size-finder" options={{ title: 'Chọn kích thước kho' }} />
      <Stack.Screen name="floor-plan" options={{ title: 'Sơ đồ mặt bằng' }} />
      <Stack.Screen name="rentals" options={{ title: 'Kho đang thuê' }} />
      <Stack.Screen name="payments" options={{ title: 'Thanh toán' }} />
      <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
    </Stack>
    <BottomNav role="CUSTOMER" />
  </View>;
}

const layout = StyleSheet.create({ root: { flex: 1 } });
