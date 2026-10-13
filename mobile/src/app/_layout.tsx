import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/auth/auth-context';
import { useAuth } from '@/auth/use-auth';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { loading } = useAuth();
  const colorScheme = useColorScheme();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Đăng nhập', headerShown: false }} />
        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="unsupported" options={{ title: 'WDP Storage' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return <AuthProvider><RootNavigation /></AuthProvider>;
}
