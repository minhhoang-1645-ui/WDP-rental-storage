import { Link } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { Paginated, StaffAppointment, StaffTask } from '@/types/api';

const menu = [
  { href: '/staff/appointments' as const, title: 'Lịch bàn giao', description: 'Xem lịch hẹn và unit cần bàn giao cho khách.' },
  { href: '/staff/tasks' as const, title: 'Công việc vận hành', description: 'Bảo trì, hỗ trợ, trả kho và chuyển kho.' },
  { href: '/staff/account' as const, title: 'Tài khoản', description: 'Thông tin nhân viên và đăng xuất.' },
];

export default function StaffHomeScreen() {
  const { user } = useAuth();
  const appointments = useApiResource<Paginated<StaffAppointment>>('/staff/appointments?limit=100');
  const maintenance = useApiResource<Paginated<StaffTask>>('/staff/maintenance?limit=100');
  const support = useApiResource<Paginated<StaffTask>>('/staff/support-requests?limit=100');
  const returns = useApiResource<Paginated<StaffTask>>('/staff/returns?limit=100');
  const transfers = useApiResource<Paginated<StaffTask>>('/staff/transfers?limit=100');
  const resources = [appointments, maintenance, support, returns, transfers];
  const loading = resources.some((item) => item.loading);
  const error = resources.find((item) => item.error)?.error;
  const refresh = () => resources.forEach((item) => item.refresh());
  const workTotal = (maintenance.data?.total ?? 0) + (support.data?.total ?? 0) + (returns.data?.total ?? 0) + (transfers.data?.total ?? 0);

  return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={WdpColors.orange} />} contentContainerStyle={styles.content}>
    <PageHeader eyebrow="Staff operations" title={`Xin chào, ${user?.fullName ?? 'nhân viên'}`} description="Theo dõi lịch bàn giao và các công việc tại cơ sở từ WDP Backend." />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <>
      <View style={styles.metrics}><MetricCard label="Lịch bàn giao" value={appointments.data?.total ?? 0} /><MetricCard label="Công việc" value={workTotal} tone="orange" /><MetricCard label="Việc ưu tiên cao" value={maintenance.data?.items.filter((item) => item.priority === 'HIGH').length ?? 0} tone="danger" /></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Thao tác nhanh</Text>{menu.map((item) => <Link key={item.href} href={item.href} asChild><Pressable style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}><View><Text style={styles.menuTitle}>{item.title}</Text><Text style={styles.menuDescription}>{item.description}</Text></View><Text style={styles.arrow}>›</Text></Pressable></Link>)}</View>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  section: { gap: WdpSpacing.sm }, sectionTitle: { color: WdpColors.navy, fontSize: 19, fontWeight: '900' },
  menuCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: WdpSpacing.md, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.md },
  pressed: { opacity: 0.72 }, menuTitle: { color: WdpColors.navy, fontSize: 16, fontWeight: '800' },
  menuDescription: { maxWidth: 290, paddingTop: 4, color: WdpColors.muted, fontSize: 13, lineHeight: 19 }, arrow: { color: WdpColors.orange, fontSize: 32, fontWeight: '500' },
});
