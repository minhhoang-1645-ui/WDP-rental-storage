import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';
import { ActivityBell } from '@/activity/ActivityCenter';
import { AccountHeaderActions } from '@/components/account-header-actions';
import { BottomNav } from '@/components/bottom-nav';
import { portalScreenOptions } from '@/portals/resources';

const resourceOptions = portalScreenOptions('STAFF');
export const unstable_settings = { initialRouteName: 'index' };

export default function StaffLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'STAFF') return <Redirect href="/" />;
  return <View style={layout.root}>
    <Stack screenOptions={{ headerRight: () => <ActivityBell />, headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
      <Stack.Screen name="index" options={{
        title: 'Công việc của tôi',
        headerRight: () => <AccountHeaderActions href="/staff/account" />,
      }} />
      <Stack.Screen name="appointments" options={{ title: 'Lịch bàn giao' }} />
      <Stack.Screen name="handover-history/[id]" options={{ title: 'Hồ sơ & lịch sử' }} />
      <Stack.Screen name="tasks" options={{ title: 'Công việc vận hành' }} />
      <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
      <Stack.Screen name="assigned-units" options={{ title: 'Kho tôi phụ trách' }} />
      <Stack.Screen name="[resource]/index" options={resourceOptions} />
      <Stack.Screen name="[resource]/[id]" options={resourceOptions} />
    </Stack>
    <BottomNav role="STAFF" />
  </View>;
}

const layout = StyleSheet.create({ root: { flex: 1 } });
