import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Home, Warehouse, CreditCard, User, ClipboardList, Wrench } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';

type Tab = { key: string; label: string; icon: typeof Home; path: string; match: string[] };

const customerTabs: Tab[] = [
  { key: 'home', label: 'Trang chủ', icon: Home, path: '/customer', match: ['/customer'] },
  { key: 'rentals', label: 'Kho thuê', icon: Warehouse, path: '/customer/rentals', match: ['/customer/rentals', '/customer/contracts', '/customer/renewals', '/customer/returns', '/customer/booking-history'] },
  { key: 'payments', label: 'Thanh toán', icon: CreditCard, path: '/customer/invoices', match: ['/customer/invoices', '/customer/payments', '/customer/payment-history', '/customer/payment-submissions'] },
  { key: 'account', label: 'Tài khoản', icon: User, path: '/customer/account', match: ['/customer/account'] },
];

const staffTabs: Tab[] = [
  { key: 'home', label: 'Công việc', icon: ClipboardList, path: '/staff', match: ['/staff'] },
  { key: 'tasks', label: 'Vận hành', icon: Wrench, path: '/staff/tasks', match: ['/staff/tasks', '/staff/appointments'] },
  { key: 'account', label: 'Tài khoản', icon: User, path: '/staff/account', match: ['/staff/account'] },
];

export function BottomNav({ role }: { role: 'CUSTOMER' | 'STAFF' }) {
  const pathname = usePathname();
  const tabs = role === 'CUSTOMER' ? customerTabs : staffTabs;
  const navigate = useCallback((path: string) => { router.push(path as any); }, []);

  return <View style={styles.wrap}>
    {tabs.map(tab => {
      const active = tab.match.some(m => pathname === m);
      const Icon = tab.icon;
      const color = active ? WdpColors.teal : WdpColors.muted;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => navigate(tab.path)} style={styles.tab}>
        {active && <View style={styles.dot} />}
        <Icon size={22} color={color} strokeWidth={active ? 2.2 : 1.6} />
        <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const BOTTOM_INSET = Platform.OS === 'ios' ? 28 : 6;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: 54 + BOTTOM_INSET,
    paddingBottom: BOTTOM_INSET,
    backgroundColor: WdpColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: WdpColors.border,
    ...Platform.select({
      ios: { shadowColor: '#0a1e2e', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: {
    position: 'absolute',
    top: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WdpColors.teal,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: WdpColors.muted,
  },
  labelActive: {
    color: WdpColors.teal,
    fontWeight: '700',
  },
});
