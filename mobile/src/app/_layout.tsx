import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider } from '@/auth/auth-context';
import { useAuth } from '@/auth/use-auth';
import { ActivityProvider } from '@/activity/ActivityProvider';
import { ActivityRefreshNote } from '@/activity/ActivityCenter';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <View style={{ flex: 1 }}><ActivityRefreshNote />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Đăng nhập', headerShown: false }} />
        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="manager" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="unsupported" options={{ title: 'NestBox Storage' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Không tìm thấy trang' }} />
      </Stack>
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AuthProvider><ActivityProvider><RootNavigation /></ActivityProvider></AuthProvider></GestureHandlerRootView>;
}
