import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useAuth } from '@/auth/use-auth';
import { destination } from '@/auth/routing';
import { WdpColors } from '@/constants/wdp-theme';
import { ActivityBell } from '@/activity/ActivityCenter';
import { View } from 'react-native';
import { BottomNav } from '@/components/bottom-nav';

export function WorkspaceLayout({ role }: { role: 'MANAGER' | 'ADMIN' }) {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={destination(user.role)} />;
  return <View style={{ flex: 1 }}><Stack screenOptions={{ headerRight: () => <ActivityBell />, headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background }, title: role === 'ADMIN' ? 'Quản trị NestBox' : 'Quản lý NestBox' }} /><BottomNav role={role} /></View>;
}
