import { Redirect, usePathname } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';
import { ActivityBell } from '@/activity/ActivityCenter';
import { BottomNav } from '@/components/bottom-nav';
import { StaffPresentation } from '@/components/staff-ui';
import { portalScreenOptions } from '@/portals/resources';

const resourceOptions = portalScreenOptions('STAFF');
export const unstable_settings = { initialRouteName: 'index' };

export default function StaffLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'STAFF') return <Redirect href="/" />;
  return <StaffPresentation.Provider value={true}><View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerTransparent: false, headerTitleStyle: { fontSize: 17 }, headerShadowVisible: false, headerStyle: { backgroundColor: WdpColors.surface }, headerRight: () => <ActivityBell />, headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
      <Stack.Screen name="index" options={{ title: 'NestBox' }} />
      <Stack.Screen name="[resource]/index" options={resourceOptions} />
      <Stack.Screen name="[resource]/[id]" options={resourceOptions} />
      <Stack.Screen name="stock-movements/index" options={{ title: 'Nhập – xuất hàng' }} />
      <Stack.Screen name="stock-movements/[id]" options={{ title: 'Chi tiết nhập – xuất' }} />
      <Stack.Screen name="assigned-units" options={{ title: 'Kho tôi phụ trách' }} />
      <Stack.Screen name="create-transfer" options={{ title: 'Chuyển kho' }} />
      <Stack.Screen name="contract-details" options={{ title: 'Chi tiết hợp đồng' }} />
      <Stack.Screen name="appointments" options={{ title: 'Lịch bàn giao' }} />
      <Stack.Screen name="handover-history/[id]" options={{ title: 'Hồ sơ & lịch sử' }} />
      <Stack.Screen name="damage-claims" options={{ title: 'Yêu cầu bồi thường' }} />
      <Stack.Screen name="overstays" options={{ title: 'Kho quá hạn' }} />
      <Stack.Screen name="tasks" options={{ title: 'Vận hành' }} />
      <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
    </Stack>
    {pathname !== '/staff/create-transfer' && <BottomNav role="STAFF" />}
  </View></StaffPresentation.Provider>;
}
