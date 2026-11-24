import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors } from '@/constants/wdp-theme';
import { BottomNav } from '@/components/bottom-nav';
import { CustomerPresentation } from '@/components/customer-presentation';
import { CustomerNotificationProvider, CustomerNotifications } from '@/components/customer-notifications';
import { portalScreenOptions } from '@/portals/resources';
import { BookingFacilityProvider } from '@/components/booking-facility-context';

const resourceOptions = portalScreenOptions('STORAGE_CUSTOMER');
export const unstable_settings = { initialRouteName: 'index' };

export default function CustomerLayout() {
  const pathname = usePathname();
  const { transaction, invoiceId } = useGlobalSearchParams();
  const { user } = useAuth();
  if (!user) return <Redirect href={pathname === '/customer/payment-result' && typeof transaction === 'string' && typeof invoiceId === 'string' &&
    /^[\w-]{1,100}$/.test(transaction) && /^[\w-]{1,100}$/.test(invoiceId)
    ? { pathname: '/login', params: { paymentTransaction: transaction, paymentInvoice: invoiceId } } : '/login'} />;
  if (user.role !== 'STORAGE_CUSTOMER') return <Redirect href="/" />;
  return <CustomerPresentation.Provider value><CustomerNotificationProvider key={user.id}><BookingFacilityProvider><View style={layout.root}>
    <Stack screenOptions={{ headerTransparent: false, headerRight: () => <CustomerNotifications />, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', headerTintColor: WdpColors.navy, contentStyle: { backgroundColor: WdpColors.background } }}>
      <Stack.Screen name="index" options={{ title: 'NestBox', headerShown: false }} />
      <Stack.Screen name="discover" options={{ title: 'Tìm kho' }} />
      <Stack.Screen name="booking" options={{ title: 'Đặt kho' }} />
      <Stack.Screen name="size-finder" options={{ title: 'Ước tính diện tích kho' }} />
      <Stack.Screen name="floor-plan" options={{ title: 'Sơ đồ mặt bằng' }} />
      <Stack.Screen name="rentals" options={{ title: 'Kho đang thuê', headerBackVisible: false, headerTitleStyle: {fontSize:22,fontWeight:'700'} }} />
      <Stack.Screen name="payments" options={{ title: 'Thanh toán' }} />
      <Stack.Screen name="payment-result" options={{ title: 'Thanh toán hóa đơn' }} />
      <Stack.Screen name="account" options={{ title: 'Tài khoản' }} />
      <Stack.Screen name="services" options={{ title: 'Dịch vụ của bạn' }} />
      <Stack.Screen name="[resource]/index" options={resourceOptions} />
      <Stack.Screen name="[resource]/[id]" options={resourceOptions} />
    </Stack>
    {!['/customer/discover', '/customer/booking'].includes(pathname) && <BottomNav role="STORAGE_CUSTOMER" />}
  </View></BookingFacilityProvider></CustomerNotificationProvider></CustomerPresentation.Provider>;
}

const layout = StyleSheet.create({ root: { flex: 1 } });
