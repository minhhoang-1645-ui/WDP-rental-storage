import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider } from '@/auth/auth-context';
import { useAuth } from '@/auth/use-auth';
import { ActivityProvider } from '@/activity/ActivityProvider';
import { ActivityRefreshNote } from '@/activity/ActivityCenter';
import { ScrollView, Text, View } from 'react-native';
import { ErrorState } from '@/components/screen-state';
import { Button, styles } from '@/operations/ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { loading, sessionError, retrySession, logout } = useAuth();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;
  if (sessionError) return <ScrollView contentContainerStyle={[styles.page, { flexGrow: 1, justifyContent: 'center' }]}><Text accessibilityRole="header" style={styles.title}>Kết nối lại NestBox</Text><Text style={styles.copy}>Chưa thể kiểm tra tài khoản đã lưu. Bạn không cần nhập lại mật khẩu chỉ vì mất kết nối.</Text><ErrorState message={sessionError} onRetry={retrySession} /><Button title="Đăng nhập bằng tài khoản khác" variant="secondary" onPress={() => void logout()} /></ScrollView>;

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
