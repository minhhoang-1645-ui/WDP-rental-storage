import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Warehouse, CreditCard, Search, Grid2X2 } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';
import { openWorkspaceEntry } from '@/utils/workspace-navigation';

type Tab = { key: string; label: string; icon: typeof Home; path: string; match: string[] };

const customerTabs: Tab[] = [
  { key: 'home', label: 'Trang chủ', icon: Home, path: '/customer', match: ['/customer'] },
  { key: 'discover', label: 'Tìm kho', icon: Search, path: '/customer/discover', match: ['/customer/discover', '/customer/booking', '/customer/size-finder'] },
  { key: 'rentals', label: 'Kho đang thuê', icon: Warehouse, path: '/customer/rentals', match: ['/customer/rentals', '/customer/floor-plan', '/customer/contracts', '/customer/contract-document', '/customer/contract-sign', '/customer/renewals', '/customer/returns', '/customer/early-returns', '/customer/transfers', '/customer/transfer-order', '/customer/stored-items', '/customer/stock-movements'] },
  { key: 'payments', label: 'Thanh toán', icon: CreditCard, path: '/customer/invoices', match: ['/customer/invoices', '/customer/payments', '/customer/payment-result', '/customer/payment-history', '/customer/payment-submissions'] },
  { key: 'services', label: 'Dịch vụ', icon: Grid2X2, path: '/customer/services', match: ['/customer/services', '/customer/account', '/customer/support-requests', '/customer/damage-claims', '/customer/deposit-settlements', '/customer/deposit-deductions', '/customer/deposit-refund', '/customer/reservations', '/customer/appointments'] },
];


export function BottomNav(_props: { role: 'STORAGE_CUSTOMER' }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabs = customerTabs;

  return <View style={[styles.wrap, { minHeight: 68 + Math.max(insets.bottom, 8), height: 'auto', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }]}>
    {tabs.map(tab => {
      const active = tab.match.some(m => pathname === m || !['/customer', '/staff', '/manager', '/admin'].includes(m) && pathname.startsWith(`${m}/`));
      const Icon = tab.icon;
      const color = active ? WdpColors.teal : WdpColors.muted;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} onPress={() => {
        if (pathname !== tab.path) openWorkspaceEntry(tab.path);
      }} style={styles.tab}>
        {active && <View style={styles.dot} />}
        <Icon size={22} color={color} strokeWidth={active ? 2.2 : 1.6} />
        <Text style={[styles.label, active && styles.labelActive, tab.key === 'rentals' && styles.rentalLabel]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const BOTTOM_INSET = Platform.OS === 'ios' ? 28 : 6;

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
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
    gap: 4,
    minHeight: 48,
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
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: WdpColors.muted,
  },
  labelActive: {
    color: WdpColors.teal,
    fontWeight: '700',
  },
  rentalLabel: {
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
  },
});
