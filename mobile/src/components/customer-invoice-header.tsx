import { Stack, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { CustomerNotifications } from './customer-notifications';
import { invoiceStyles as s } from './customer-invoice-styles';

export function InvoiceHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return <>
    <Stack.Screen options={{ headerShown: false, gestureEnabled: !onBack }} />
    <SafeAreaView edges={['top']} style={s.nav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={s.navButton}
        onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/customer'))}>
        <ChevronLeft size={23} color="#14233D" />
      </Pressable>
      <Text accessibilityRole="header" style={s.navTitle}>{title}</Text>
      <View style={s.navButton}><CustomerNotifications /></View>
    </SafeAreaView>
  </>;
}
