import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Warehouse, CreditCard, User, ClipboardList, Wrench, Search, Grid2X2, Users, Settings, ShieldCheck } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';

type Tab = { key: string; label: string; icon: typeof Home; path: string; match: string[] };

const customerTabs: Tab[] = [
  { key: 'home', label: 'Trang chủ', icon: Home, path: '/customer', match: ['/customer'] },
  { key: 'discover', label: 'Tìm kho', icon: Search, path: '/customer/discover', match: ['/customer/discover', '/customer/booking', '/customer/floor-plan', '/customer/size-finder'] },
  { key: 'rentals', label: 'Kho thuê', icon: Warehouse, path: '/customer/rentals', match: ['/customer/rentals', '/customer/contracts', '/customer/renewals', '/customer/returns', '/customer/booking-history'] },
  { key: 'payments', label: 'Thanh toán', icon: CreditCard, path: '/customer/invoices', match: ['/customer/invoices', '/customer/payments', '/customer/payment-history', '/customer/payment-submissions'] },
  { key: 'services', label: 'Dịch vụ', icon: Grid2X2, path: '/customer/services', match: ['/customer/services', '/customer/account', '/customer/stored-items', '/customer/stock-movements', '/customer/support-requests', '/customer/deposit-settlements', '/customer/transfers', '/customer/reservations', '/customer/appointments'] },
];

const staffTabs: Tab[] = [
  { key: 'home', label: 'Công việc', icon: ClipboardList, path: '/staff', match: ['/staff'] },
  { key: 'tasks', label: 'Vận hành', icon: Wrench, path: '/staff/tasks', match: ['/staff/tasks', '/staff/appointments'] },
  { key: 'account', label: 'Tài khoản', icon: User, path: '/staff/account', match: ['/staff/account'] },
];

const managerTabs: Tab[] = [
  { key: 'home', label: 'Tổng quan', icon: Home, path: '/manager', match: ['/manager'] },
  { key: 'approvals', label: 'Duyệt', icon: ShieldCheck, path: '/manager/approvals', match: ['/manager/approvals', '/manager/reviews'] },
  { key: 'assignments', label: 'Phân công', icon: Users, path: '/manager/assignments', match: ['/manager/assignments'] },
  { key: 'facility', label: 'Cơ sở', icon: Warehouse, path: '/manager/facility', match: ['/manager/facility'] },
  { key: 'account', label: 'Tài khoản', icon: User, path: '/manager/account', match: ['/manager/account'] },
];
const adminTabs: Tab[] = [
  { key: 'home', label: 'Tổng quan', icon: Home, path: '/admin', match: ['/admin'] },
  { key: 'users', label: 'Người dùng', icon: Users, path: '/admin/users', match: ['/admin/users', '/admin/roles', '/admin/account-status'] },
  { key: 'settings', label: 'Cài đặt', icon: Settings, path: '/admin/settings', match: ['/admin/settings'] },
  { key: 'account', label: 'Tài khoản', icon: User, path: '/admin/account', match: ['/admin/account'] },
];
export function BottomNav({ role }: { role: 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN' }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabs = { CUSTOMER: customerTabs, STAFF: staffTabs, MANAGER: managerTabs, ADMIN: adminTabs }[role];
  const navigate = useCallback((path: string) => { router.navigate(path as Href); }, []);

  return <View style={[styles.wrap, { height: 60 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }]}>
    {tabs.map(tab => {
      const active = tab.match.some(m => pathname === m || !['/customer', '/staff', '/manager', '/admin'].includes(m) && pathname.startsWith(`${m}/`));
      const Icon = tab.icon;
      const color = active ? WdpColors.teal : WdpColors.muted;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} onPress={() => navigate(tab.path)} style={styles.tab}>
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
