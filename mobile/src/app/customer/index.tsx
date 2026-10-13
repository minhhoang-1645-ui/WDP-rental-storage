import { Link } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { CustomerInvoice, CustomerRental, Paginated } from '@/types/api';
import { formatMoney } from '@/utils/format';

const menu = [
  { href: '/customer/rentals' as const, title: 'Kho đang thuê', description: 'Xem unit, hợp đồng và thời hạn sử dụng.' },
  { href: '/customer/payments' as const, title: 'Hóa đơn', description: 'Theo dõi số dư và trạng thái thanh toán.' },
  { href: '/customer/account' as const, title: 'Tài khoản', description: 'Thông tin đăng nhập và đăng xuất.' },
];

export default function CustomerHomeScreen() {
  const { user } = useAuth();
  const rentals = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100');
  const invoices = useApiResource<Paginated<CustomerInvoice>>('/customer/invoices?limit=100');
  const loading = rentals.loading || invoices.loading;
  const error = rentals.error || invoices.error;
  const refresh = () => { rentals.refresh(); invoices.refresh(); };
  const outstanding = invoices.data?.items.reduce((sum, item) => sum + item.balanceDue, 0) ?? 0;

  return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={WdpColors.orange} />} contentContainerStyle={styles.content}>
    <PageHeader eyebrow="Customer portal" title={`Xin chào, ${user?.fullName ?? 'khách hàng'}`} description="Dữ liệu kho thuê và hóa đơn được đồng bộ trực tiếp từ WDP Backend." />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <>
      <View style={styles.metrics}><MetricCard label="Kho đang thuê" value={rentals.data?.total ?? 0} /><MetricCard label="Kho quá hạn" value={rentals.data?.items.filter((item) => item.isOverdue).length ?? 0} tone="danger" /><MetricCard label="Còn phải trả" value={formatMoney(outstanding)} tone="orange" /></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Chức năng</Text>{menu.map((item) => <Link key={item.href} href={item.href} asChild><Pressable style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}><View><Text style={styles.menuTitle}>{item.title}</Text><Text style={styles.menuDescription}>{item.description}</Text></View><Text style={styles.arrow}>›</Text></Pressable></Link>)}</View>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  section: { gap: WdpSpacing.sm },
  sectionTitle: { color: WdpColors.navy, fontSize: 19, fontWeight: '900' },
  menuCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: WdpSpacing.md, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.md },
  pressed: { opacity: 0.72 },
  menuTitle: { color: WdpColors.navy, fontSize: 16, fontWeight: '800' },
  menuDescription: { maxWidth: 290, paddingTop: 4, color: WdpColors.muted, fontSize: 13, lineHeight: 19 },
  arrow: { color: WdpColors.orange, fontSize: 32, fontWeight: '500' },
});
